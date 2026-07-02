const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const Block = require('../models/Block');
const { uploadStream } = require('../services/cloudinary');

exports.getRooms = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch rooms where the current user is a participant
    const rooms = await Room.find({ "participants.user": userId })
      .populate("participants.user", "id username name avatar verified isOnline lastSeen")
      .lean();

    const roomsList = [];
    const now = new Date();

    for (const room of rooms) {
      const rawLastMessage = await Message.findOne({
        room: room._id,
        deletions: { $ne: userId }
      })
        .sort({ createdAt: -1 })
        .populate('sender', 'id username')
        .populate({
          path: 'replyTo',
          populate: { path: 'sender', select: 'id username' }
        })
        .lean();

      let lastMessage = rawLastMessage;

      // Filter out expired disappearing messages
      if (lastMessage && lastMessage.selfDestructTimer) {
        const expiryTime = new Date(new Date(lastMessage.createdAt).getTime() + lastMessage.selfDestructTimer * 1000);
        if (expiryTime < now) {
          lastMessage = null;
        }
      }

      const record = room.participants.find(p => p.user && p.user._id.toString() === userId.toString());
      if (!record) continue;

      // Calculate unread count
      const unreadCount = await Message.countDocuments({
        room: room._id,
        sender: { $ne: userId },
        deletions: { $ne: userId },
        ...(record.lastReadAt ? { createdAt: { $gt: record.lastReadAt } } : {})
      });

      let name = room.name;
      let avatar = room.avatar;
      let otherUser = null;

      if (!room.isGroup) {
        const otherPart = room.participants.find(p => p.user && p.user._id.toString() !== userId.toString());
        otherUser = otherPart ? otherPart.user : null;
        name = otherUser ? `@${otherUser.username}` : 'Direct Message';
        avatar = otherUser ? otherUser.avatar : null;
      }

      // Format last message for compatibility
      let formattedLastMessage = null;
      if (lastMessage) {
        formattedLastMessage = {
          ...lastMessage,
          id: lastMessage._id.toString(),
          roomId: lastMessage.room ? lastMessage.room.toString() : null,
          senderId: lastMessage.sender ? lastMessage.sender._id.toString() : null,
          sender: lastMessage.sender ? {
            id: lastMessage.sender._id.toString(),
            username: lastMessage.sender.username
          } : null,
          media: lastMessage.media ? lastMessage.media.map(m => ({ ...m, id: m._id.toString() })) : []
        };
      }

      roomsList.push({
        id: room._id.toString(),
        isGroup: room.isGroup,
        name,
        avatar,
        description: room.description,
        createdBy: room.createdBy ? room.createdBy.toString() : null,
        role: record.role,
        isPinned: record.isPinned,
        isArchived: record.isArchived,
        isMuted: record.isMuted,
        lastReadAt: record.lastReadAt,
        unreadCount,
        lastMessage: formattedLastMessage,
        otherUser: otherUser ? {
          ...otherUser,
          id: otherUser._id.toString()
        } : null,
        participants: room.participants.map(p => {
          if (!p.user) return null;
          return {
            id: p.user._id.toString(),
            username: p.user.username,
            avatar: p.user.avatar,
            role: p.role,
            isOnline: p.user.isOnline,
            lastSeen: p.user.lastSeen,
          };
        }).filter(Boolean),
        updatedAt: lastMessage ? lastMessage.createdAt : room.createdAt,
      });
    }

    // Sort: Pinned chats first, then order by updatedAt desc
    roomsList.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return res.json({ rooms: roomsList });
  } catch (err) {
    console.error('Get rooms error:', err);
    return res.status(500).json({ error: 'Failed to retrieve conversation list' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const now = new Date();

    // Verify participant
    const room = await Room.findOne({ _id: roomId, "participants.user": userId });

    if (!room) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messages = await Message.find({
      room: roomId,
      deletions: { $ne: userId }
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'id username avatar')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'id username' }
      })
      .lean();

    // Filter disappearing messages
    const activeMessages = messages.filter(msg => {
      if (msg.selfDestructTimer) {
        const expiryTime = new Date(new Date(msg.createdAt).getTime() + msg.selfDestructTimer * 1000);
        if (expiryTime < now) {
          return false;
        }
      }
      return true;
    });

    // Map properties for frontend compatibility
    const formattedMessages = activeMessages.map(msg => ({
      ...msg,
      id: msg._id.toString(),
      roomId: msg.room ? msg.room.toString() : null,
      senderId: msg.sender ? msg.sender._id.toString() : null,
      sender: msg.sender ? {
        id: msg.sender._id.toString(),
        username: msg.sender.username,
        avatar: msg.sender.avatar
      } : null,
      media: msg.media ? msg.media.map(m => ({ ...m, id: m._id.toString() })) : [],
      replyToId: msg.replyTo ? msg.replyTo._id.toString() : null,
      replyTo: msg.replyTo ? {
        id: msg.replyTo._id.toString(),
        text: msg.replyTo.text,
        sender: msg.replyTo.sender ? {
          id: msg.replyTo.sender._id.toString(),
          username: msg.replyTo.sender.username
        } : null
      } : null,
      reactions: msg.reactions ? msg.reactions.map(r => ({
        id: r._id.toString(),
        reaction: r.reaction,
        userId: r.user ? r.user.toString() : null,
        user: {
          id: r.user ? r.user.toString() : null,
          username: r.username
        }
      })) : []
    }));

    // Mark room as read for the user
    await Room.updateOne(
      { _id: roomId, "participants.user": userId },
      { $set: { "participants.$.lastReadAt": new Date() } }
    );

    // Update message status to READ for sender if not read
    await Message.updateMany(
      { room: roomId, sender: { $ne: userId }, status: 'SENT' },
      { $set: { status: 'READ' } }
    );

    return res.json({ messages: formattedMessages });
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ error: 'Failed to load message history' });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: 'You cannot message yourself' });
    }

    // Check blocks
    const blockedRecord = await Block.findOne({
      $or: [
        { blocker: currentUserId, blocked: targetUserId },
        { blocker: targetUserId, blocked: currentUserId }
      ]
    });

    if (blockedRecord) {
      return res.status(403).json({ error: 'Messaging restricted by blocks' });
    }

    const existingRooms = await Room.find({
      isGroup: false,
      $and: [
        { "participants.user": currentUserId },
        { "participants.user": targetUserId }
      ]
    });

    if (existingRooms.length > 0) {
      return res.json({ roomId: existingRooms[0]._id.toString() });
    }

    const newRoom = await Room.create({
      isGroup: false,
      participants: [
        { user: currentUserId },
        { user: targetUserId },
      ],
    });

    return res.status(201).json({ roomId: newRoom._id.toString() });
  } catch (err) {
    console.error('Create room error:', err);
    return res.status(500).json({ error: 'Failed to initiate conversation' });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { name, description, avatar, targetUserIds } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const participantIds = Array.from(new Set([currentUserId, ...(targetUserIds || [])]));

    if (participantIds.length < 2) {
      return res.status(400).json({ error: 'A group must have at least 2 members' });
    }

    const room = await Room.create({
      isGroup: true,
      name,
      description,
      avatar: avatar || null,
      createdBy: currentUserId,
      participants: participantIds.map(uId => ({
        user: uId,
        role: uId === currentUserId ? 'ADMIN' : 'MEMBER'
      }))
    });

    return res.status(201).json({ roomId: room._id.toString() });
  } catch (err) {
    console.error('Create group error:', err);
    return res.status(500).json({ error: 'Failed to create group chat' });
  }
};

exports.addGroupMembers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { roomId } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'List of user IDs is required' });
    }

    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const currentParticipant = room.participants.find(p => p.user.toString() === currentUserId);

    if (!currentParticipant || currentParticipant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only group admins can add members' });
    }

    let addedCount = 0;
    for (const uId of userIds) {
      const alreadyPart = room.participants.some(p => p.user.toString() === uId);
      if (!alreadyPart) {
        room.participants.push({ user: uId, role: 'MEMBER' });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      await room.save();
    }

    return res.json({ message: `Successfully added ${addedCount} members` });
  } catch (err) {
    console.error('Add group members error:', err);
    return res.status(500).json({ error: 'Failed to add group members' });
  }
};

exports.removeGroupMember = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { roomId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const currentParticipant = room.participants.find(p => p.user.toString() === currentUserId);

    if (!currentParticipant || currentParticipant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only group admins can remove members' });
    }

    room.participants = room.participants.filter(p => p.user.toString() !== targetUserId);
    await room.save();

    return res.json({ message: 'Member removed successfully' });
  } catch (err) {
    console.error('Remove group member error:', err);
    return res.status(500).json({ error: 'Failed to remove group member' });
  }
};

exports.promoteGroupAdmin = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { roomId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const currentParticipant = room.participants.find(p => p.user.toString() === currentUserId);

    if (!currentParticipant || currentParticipant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only group admins can promote members' });
    }

    await Room.updateOne(
      { _id: roomId, "participants.user": targetUserId },
      { $set: { "participants.$.role": 'ADMIN' } }
    );

    return res.json({ message: 'Member promoted to admin successfully' });
  } catch (err) {
    console.error('Promote admin error:', err);
    return res.status(500).json({ error: 'Failed to promote member' });
  }
};

exports.togglePinRoom = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    const room = await Room.findOne({ _id: roomId, "participants.user": userId });

    if (!room) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const participant = room.participants.find(p => p.user.toString() === userId);
    const newPinStatus = !participant.isPinned;

    await Room.updateOne(
      { _id: roomId, "participants.user": userId },
      { $set: { "participants.$.isPinned": newPinStatus } }
    );

    return res.json({ isPinned: newPinStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to toggle pin state' });
  }
};

exports.toggleArchiveRoom = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    const room = await Room.findOne({ _id: roomId, "participants.user": userId });

    if (!room) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const participant = room.participants.find(p => p.user.toString() === userId);
    const newArchiveStatus = !participant.isArchived;

    await Room.updateOne(
      { _id: roomId, "participants.user": userId },
      { $set: { "participants.$.isArchived": newArchiveStatus } }
    );

    return res.json({ isArchived: newArchiveStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to toggle archive state' });
  }
};

exports.toggleMuteRoom = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    const room = await Room.findOne({ _id: roomId, "participants.user": userId });

    if (!room) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const participant = room.participants.find(p => p.user.toString() === userId);
    const newMutedStatus = !participant.isMuted;

    await Room.updateOne(
      { _id: roomId, "participants.user": userId },
      { $set: { "participants.$.isMuted": newMutedStatus } }
    );

    return res.json({ isMuted: newMutedStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to toggle mute state' });
  }
};

exports.uploadMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const uploadPromises = req.files.map(async (file) => {
      let type = 'FILE';
      if (file.mimetype.startsWith('image/')) {
        type = 'IMAGE';
      } else if (file.mimetype.startsWith('video/')) {
        type = 'VIDEO';
      } else if (file.mimetype.startsWith('audio/')) {
        type = 'VOICE';
      }

      // Determine resource type for Cloudinary
      const clResourceType = type === 'IMAGE' ? 'image' : type === 'VIDEO' || type === 'VOICE' ? 'video' : 'raw';
      
      const result = await uploadStream(file.buffer, 'chat_media', clResourceType);

      return {
        url: result.secure_url,
        type,
        name: file.originalname,
        size: file.size
      };
    });

    const uploaded = await Promise.all(uploadPromises);
    return res.status(201).json({ media: uploaded });
  } catch (err) {
    console.error('Media upload error:', err);
    return res.status(500).json({ error: 'Failed to upload media files' });
  }
};

exports.searchMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { q } = req.query;

    if (!q) {
      return res.json({ messages: [] });
    }

    const room = await Room.findOne({ _id: roomId, "participants.user": userId });

    if (!room) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await Message.find({
      room: roomId,
      text: { $regex: q, $options: 'i' },
      deletions: { $ne: userId }
    })
      .populate('sender', 'id username name avatar')
      .sort({ createdAt: -1 })
      .lean();

    const formattedMessages = messages.map(msg => ({
      ...msg,
      id: msg._id.toString(),
      roomId: msg.room ? msg.room.toString() : null,
      senderId: msg.sender ? msg.sender._id.toString() : null,
      sender: msg.sender ? {
        id: msg.sender._id.toString(),
        username: msg.sender.username,
        name: msg.sender.name,
        avatar: msg.sender.avatar
      } : null,
      media: msg.media ? msg.media.map(m => ({ ...m, id: m._id.toString() })) : []
    }));

    return res.json({ messages: formattedMessages });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
};

exports.deleteMessageForMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    await Message.updateOne(
      { _id: messageId },
      { $addToSet: { deletions: userId } }
    );

    return res.json({ messageId, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete message for you' });
  }
};

exports.deleteMessageForEveryone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.sender.toString() !== userId) {
      return res.status(403).json({ error: 'You can only delete your own messages for everyone' });
    }

    message.isDeletedForEveryone = true;
    message.text = 'This message was deleted';
    message.mediaUrl = null;
    message.media = [];
    await message.save();

    return res.json({ message, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
};

exports.togglePinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    message.isPinned = !message.isPinned;
    await message.save();

    return res.json({ message });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to toggle pin state' });
  }
};

exports.viewOnceMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.sender.toString() === userId) {
      return res.status(403).json({ error: 'Sender cannot trigger view once consumption' });
    }

    message.text = 'Opened view-once media';
    message.mediaUrl = null;
    message.media = [];
    message.isDeletedForEveryone = true;
    await message.save();

    return res.json({ messageId, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to view once' });
  }
};
