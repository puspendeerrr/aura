const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const Block = require('../models/Block');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[AUTH FATAL] JWT_SECRET is required in environment variables.');
  process.exit(1);
}

// Map to track active user socket IDs: userId -> socketId
const activeUsers = new Map();

const registerChatHandlers = (io) => {
  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user || user.isBanned) {
        return next(new Error('Authentication error: Invalid user or user banned'));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket authentication failed:', err);
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`User connected to websocket: ${socket.user.username} (${socket.id})`);

    // Register active user
    activeUsers.set(userId, socket.id);

    // Update user online status in database
    try {
      await User.findByIdAndUpdate(userId, { $set: { isOnline: true } });
      // Broadcast online status to followers
      socket.broadcast.emit('user_presence', { userId, isOnline: true });
    } catch (err) {
      console.error('Failed to update online presence:', err);
    }

    // Join room event (supports DMs & Groups)
    socket.on('join_room', (data) => {
      const { roomId } = data;
      socket.join(roomId);
      console.log(`User ${socket.user.username} joined room: ${roomId}`);
    });

    // Typing Indicators
    socket.on('typing', (data) => {
      const { roomId } = data;
      socket.to(roomId).emit('user_typing', { roomId, username: socket.user.username });
    });

    socket.on('stop_typing', (data) => {
      const { roomId } = data;
      socket.to(roomId).emit('user_stop_typing', { roomId, username: socket.user.username });
    });

    // Send message event
    socket.on('send_message', async (data) => {
      try {
        const { roomId, text, replyToId, isForwarded, isViewOnce, selfDestructTimer, media } = data;

        if (!roomId) return;

        // Verify sender is participant in the room
        const roomInfo = await Room.findOne({ _id: roomId, "participants.user": userId });

        if (!roomInfo) {
          socket.emit('error', { message: 'Unauthorized to post in this room' });
          return;
        }

        // Verify block restrictions for 1-on-1 chats
        if (!roomInfo.isGroup) {
          const otherParticipant = roomInfo.participants.find(p => p.user.toString() !== userId);
          if (otherParticipant) {
            const blockRecord = await Block.findOne({
              $or: [
                { blocker: userId, blocked: otherParticipant.user },
                { blocker: otherParticipant.user, blocked: userId }
              ]
            });

            if (blockRecord) {
              socket.emit('error', { message: 'Message delivery blocked.' });
              return;
            }
          }
        }

        // Write message to Database with nested media and replies
        const messageObj = await Message.create({
          room: roomId,
          sender: userId,
          text: text || null,
          replyTo: replyToId || null,
          isForwarded: isForwarded || false,
          isViewOnce: isViewOnce || false,
          selfDestructTimer: selfDestructTimer || null,
          media: media || []
        });

        const message = await Message.findById(messageObj._id)
          .populate('sender', 'id username avatar')
          .populate({
            path: 'replyTo',
            populate: { path: 'sender', select: 'id username' }
          })
          .lean();

        const formattedMessage = {
          ...message,
          id: message._id.toString(),
          roomId: message.room ? message.room.toString() : null,
          senderId: message.sender ? message.sender._id.toString() : null,
          sender: message.sender ? {
            id: message.sender._id.toString(),
            username: message.sender.username,
            avatar: message.sender.avatar
          } : null,
          media: message.media ? message.media.map(m => ({ ...m, id: m._id.toString() })) : [],
          replyToId: message.replyTo ? message.replyTo._id.toString() : null,
          replyTo: message.replyTo ? {
            id: message.replyTo._id.toString(),
            text: message.replyTo.text,
            sender: message.replyTo.sender ? {
              id: message.replyTo.sender._id.toString(),
              username: message.replyTo.sender.username
            } : null
          } : null
        };

        // Broadcast message to all room members
        io.to(roomId).emit('receive_message', formattedMessage);

        // Send notifications to room participants who are not currently focused on the room
        const recipients = roomInfo.participants.filter(p => p.user.toString() !== userId);
        for (const recipient of recipients) {
          const recipientSocketId = activeUsers.get(recipient.user.toString());
          if (recipientSocketId) {
            io.to(recipientSocketId).emit('live_notification', {
              id: Math.random().toString(),
              type: 'MESSAGE',
              sender: {
                username: socket.user.username,
                avatar: socket.user.avatar,
              },
              roomId,
              messageText: text || (media && media.length > 0 ? 'Sent attachment(s)' : 'Sent a message'),
            });
          }
        }
      } catch (err) {
        console.error('Socket send_message error:', err);
        socket.emit('error', { message: 'Failed to deliver message' });
      }
    });

    // Handle reactions
    socket.on('react_message', async (data) => {
      try {
        const { messageId, reaction, roomId } = data;

        const message = await Message.findById(messageId);
        if (!message) return;

        // Remove existing reaction from this user if present
        message.reactions = message.reactions.filter(r => r.user.toString() !== userId);

        // Save new reaction
        message.reactions.push({
          user: userId,
          username: socket.user.username,
          reaction
        });

        await message.save();

        const formattedReaction = {
          userId,
          username: socket.user.username,
          reaction
        };

        io.to(roomId).emit('message_reaction_update', { messageId, msgReaction: formattedReaction });
      } catch (err) {
        console.error('Socket react message error:', err);
      }
    });

    // Screenshot alert
    socket.on('screenshot_taken', (data) => {
      const { roomId } = data;
      socket.to(roomId).emit('screenshot_notified', { roomId, username: socket.user.username });
    });

    // Mark messages as read event
    socket.on('mark_read', async (data) => {
      try {
        const { roomId } = data;

        if (!roomId) return;

        // Update read status for messages sent by others in the room
        await Message.updateMany(
          { room: roomId, sender: { $ne: userId }, status: 'SENT' },
          { $set: { status: 'READ' } }
        );

        // Update user's last read timestamp for this room
        await Room.updateOne(
          { _id: roomId, "participants.user": userId },
          { $set: { "participants.$.lastReadAt": new Date() } }
        );

        // Notify other room participants that messages are read
        socket.to(roomId).emit('messages_read', { roomId });
      } catch (err) {
        console.error('Socket mark_read error:', err);
      }
    });

    // Clean up offline status on disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected from websocket: ${socket.user.username} (${socket.id})`);
      activeUsers.delete(userId);

      try {
        await User.findByIdAndUpdate(userId, {
          $set: {
            isOnline: false,
            lastSeen: new Date()
          }
        });
        // Broadcast offline status
        socket.broadcast.emit('user_presence', { userId, isOnline: false, lastSeen: new Date() });
      } catch (err) {
        console.error('Failed to update offline status:', err);
      }
    });
  });
};

// Helper function to send direct live notifications from REST routes
const sendLiveNotification = (io, recipientId, notificationPayload) => {
  const socketId = activeUsers.get(recipientId);
  if (socketId) {
    io.to(socketId).emit('live_notification', notificationPayload);
  }
};

module.exports = {
  registerChatHandlers,
  sendLiveNotification,
};
