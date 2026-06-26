const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

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

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'aura_super_secret_jwt_key_2026');
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

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
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: true }
      });
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
        const isParticipant = await prisma.roomParticipant.findUnique({
          where: {
            roomId_userId: { roomId, userId },
          },
        });

        if (!isParticipant) {
          socket.emit('error', { message: 'Unauthorized to post in this room' });
          return;
        }

        // Verify block restrictions for 1-on-1 chats
        const roomInfo = await prisma.room.findUnique({
          where: { id: roomId },
          include: { participants: true }
        });

        if (roomInfo && !roomInfo.isGroup) {
          const otherParticipant = roomInfo.participants.find(p => p.userId !== userId);
          if (otherParticipant) {
            const blockRecord = await prisma.block.findFirst({
              where: {
                OR: [
                  { blockerId: userId, blockedId: otherParticipant.userId },
                  { blockerId: otherParticipant.userId, blockedId: userId }
                ]
              }
            });

            if (blockRecord) {
              socket.emit('error', { message: 'Message delivery blocked.' });
              return;
            }
          }
        }

        // Write message to Database with nested media and replies
        const message = await prisma.message.create({
          data: {
            roomId,
            senderId: userId,
            text,
            replyToId: replyToId || null,
            isForwarded: isForwarded || false,
            isViewOnce: isViewOnce || false,
            selfDestructTimer: selfDestructTimer || null,
            media: {
              create: media || []
            }
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
            media: true,
            replyTo: {
              include: {
                sender: {
                  select: { id: true, username: true }
                }
              }
            }
          },
        });

        // Broadcast message to all room members
        io.to(roomId).emit('receive_message', message);

        // Send notifications to room participants who are not currently focused on the room
        if (roomInfo) {
          const recipients = roomInfo.participants.filter(p => p.userId !== userId);
          for (const recipient of recipients) {
            const recipientSocketId = activeUsers.get(recipient.userId);
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

        // Delete existing reaction from this user if present
        const existingReaction = await prisma.messageReaction.findFirst({
          where: { messageId, userId }
        });

        if (existingReaction) {
          await prisma.messageReaction.delete({
            where: { id: existingReaction.id }
          });
        }

        const msgReaction = await prisma.messageReaction.create({
          data: {
            messageId,
            userId,
            reaction
          },
          include: {
            user: { select: { username: true } }
          }
        });

        io.to(roomId).emit('message_reaction_update', { messageId, msgReaction });
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
        await prisma.message.updateMany({
          where: {
            roomId,
            senderId: { not: userId },
            status: 'SENT',
          },
          data: { status: 'READ' },
        });

        // Update user's last read timestamp for this room
        await prisma.roomParticipant.update({
          where: {
            roomId_userId: { roomId, userId }
          },
          data: {
            lastReadAt: new Date()
          }
        });

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
        await prisma.user.update({
          where: { id: userId },
          data: {
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
