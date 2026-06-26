const prisma = require('../config/db');
const { uploadStream } = require('../services/cloudinary');

exports.getRooms = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch room participants for the current user
    const participantRecords = await prisma.roomParticipant.findMany({
      where: { userId },
      include: {
        room: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    name: true,
                    avatar: true,
                    verified: true,
                    isOnline: true,
                    lastSeen: true,
                  }
                }
              }
            },
            messages: {
              where: {
                deletions: {
                  none: { userId }
                }
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                media: true,
                sender: {
                  select: { id: true, username: true }
                }
              }
            }
          }
        }
      }
    });

    const roomsList = [];
    const now = new Date();

    for (const record of participantRecords) {
      const room = record.room;
      const rawLastMessage = room.messages[0] || null;
      let lastMessage = rawLastMessage;

      // Filter out expired disappearing messages
      if (lastMessage && lastMessage.selfDestructTimer) {
        const expiryTime = new Date(lastMessage.createdAt.getTime() + lastMessage.selfDestructTimer * 1000);
        if (expiryTime < now) {
          lastMessage = null;
        }
      }

      // Calculate unread count
      const unreadCount = await prisma.message.count({
        where: {
          roomId: room.id,
          senderId: { not: userId },
          createdAt: record.lastReadAt ? { gt: record.lastReadAt } : undefined,
          deletions: {
            none: { userId }
          }
        }
      });

      let name = room.name;
      let avatar = room.avatar;
      let otherUser = null;

      if (!room.isGroup) {
        const otherPart = room.participants.find(p => p.userId !== userId);
        otherUser = otherPart ? otherPart.user : null;
        name = otherUser ? `@${otherUser.username}` : 'Direct Message';
        avatar = otherUser ? otherUser.avatar : null;
      }

      roomsList.push({
        id: room.id,
        isGroup: room.isGroup,
        name,
        avatar,
        description: room.description,
        createdBy: room.createdBy,
        role: record.role,
        isPinned: record.isPinned,
        isArchived: record.isArchived,
        isMuted: record.isMuted,
        lastReadAt: record.lastReadAt,
        unreadCount,
        lastMessage,
        otherUser,
        participants: room.participants.map(p => ({
          id: p.user.id,
          username: p.user.username,
          avatar: p.user.avatar,
          role: p.role,
          isOnline: p.user.isOnline,
          lastSeen: p.user.lastSeen,
        })),
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
    const isParticipant = await prisma.roomParticipant.findUnique({
      where: {
        roomId_userId: { roomId, userId },
      },
    });

    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messages = await prisma.message.findMany({
      where: {
        roomId,
        deletions: {
          none: { userId }
        }
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        media: true,
        reactions: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        },
        replyTo: {
          include: {
            sender: {
              select: { id: true, username: true }
            }
          }
        }
      },
    });

    // Filter disappearing messages
    const activeMessages = messages.filter(msg => {
      if (msg.selfDestructTimer) {
        const expiryTime = new Date(msg.createdAt.getTime() + msg.selfDestructTimer * 1000);
        if (expiryTime < now) {
          return false;
        }
      }
      return true;
    });

    // Mark room as read for the user
    await prisma.roomParticipant.update({
      where: {
        roomId_userId: { roomId, userId }
      },
      data: {
        lastReadAt: new Date()
      }
    });

    // Update message status to READ for sender if not read
    await prisma.message.updateMany({
      where: {
        roomId,
        senderId: { not: userId },
        status: 'SENT'
      },
      data: {
        status: 'READ'
      }
    });

    return res.json({ messages: activeMessages });
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
    const blockedRecord = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUserId }
        ]
      }
    });

    if (blockedRecord) {
      return res.status(403).json({ error: 'Messaging restricted by blocks' });
    }

    const existingRooms = await prisma.room.findMany({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      select: { id: true },
    });

    if (existingRooms.length > 0) {
      return res.json({ roomId: existingRooms[0].id });
    }

    const newRoom = await prisma.room.create({
      data: {
        isGroup: false,
        participants: {
          create: [
            { userId: currentUserId },
            { userId: targetUserId },
          ],
        },
      },
    });

    return res.status(201).json({ roomId: newRoom.id });
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

    const room = await prisma.room.create({
      data: {
        isGroup: true,
        name,
        description,
        avatar: avatar || null,
        createdBy: currentUserId,
        participants: {
          create: participantIds.map(uId => ({
            userId: uId,
            role: uId === currentUserId ? 'ADMIN' : 'MEMBER'
          }))
        }
      }
    });

    return res.status(201).json({ roomId: room.id });
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

    const currentParticipant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: currentUserId } }
    });

    if (!currentParticipant || currentParticipant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only group admins can add members' });
    }

    let addedCount = 0;
    for (const uId of userIds) {
      try {
        await prisma.roomParticipant.create({
          data: {
            roomId,
            userId: uId,
            role: 'MEMBER'
          }
        });
        addedCount++;
      } catch (e) {
        // Skip duplicate
      }
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

    const currentParticipant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: currentUserId } }
    });

    if (!currentParticipant || currentParticipant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only group admins can remove members' });
    }

    await prisma.roomParticipant.delete({
      where: { roomId_userId: { roomId, userId: targetUserId } }
    });

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

    const currentParticipant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: currentUserId } }
    });

    if (!currentParticipant || currentParticipant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only group admins can promote members' });
    }

    await prisma.roomParticipant.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role: 'ADMIN' }
    });

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

    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } }
    });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const updated = await prisma.roomParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { isPinned: !participant.isPinned }
    });

    return res.json({ isPinned: updated.isPinned });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to toggle pin state' });
  }
};

exports.toggleArchiveRoom = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } }
    });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const updated = await prisma.roomParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { isArchived: !participant.isArchived }
    });

    return res.json({ isArchived: updated.isArchived });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to toggle archive state' });
  }
};

exports.toggleMuteRoom = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } }
    });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const updated = await prisma.roomParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { isMuted: !participant.isMuted }
    });

    return res.json({ isMuted: updated.isMuted });
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

    const isPart = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } }
    });

    if (!isPart) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.message.findMany({
      where: {
        roomId,
        text: { contains: q, mode: 'insensitive' },
        deletions: {
          none: { userId }
        }
      },
      include: {
        sender: {
          select: { id: true, username: true, name: true, avatar: true }
        },
        media: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ messages });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
};

exports.deleteMessageForMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    await prisma.messageDeletion.create({
      data: {
        messageId,
        userId
      }
    });

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

    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own messages for everyone' });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        isDeletedForEveryone: true,
        text: 'This message was deleted',
        mediaUrl: null
      }
    });

    await prisma.messageMedia.deleteMany({
      where: { messageId }
    });

    return res.json({ message: updated, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
};

exports.togglePinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: !message.isPinned }
    });

    return res.json({ message: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to toggle pin state' });
  }
};

exports.viewOnceMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId === userId) {
      return res.status(403).json({ error: 'Sender cannot trigger view once consumption' });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        text: 'Opened view-once media',
        mediaUrl: null,
        isDeletedForEveryone: true
      }
    });

    await prisma.messageMedia.deleteMany({
      where: { messageId }
    });

    return res.json({ messageId, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to view once' });
  }
};
