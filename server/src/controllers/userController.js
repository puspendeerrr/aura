const prisma = require('../config/db');
const { uploadStream } = require('../services/cloudinary');

exports.getProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatar: true,
        isPrivate: true,
        verified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify blocking status
    const isBlocked = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: user.id,
          blockedId: currentUserId,
        },
      },
    });

    if (isBlocked) {
      return res.status(403).json({ error: 'Access denied: Profile unavailable' });
    }

    // Check relationship status
    const followRecord = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: user.id,
        },
      },
    });

    const isFollowing = followRecord?.status === 'ACCEPTED';
    const isPending = followRecord?.status === 'PENDING';

    const followersCount = await prisma.follow.count({
      where: { followingId: user.id, status: 'ACCEPTED' },
    });

    const followingCount = await prisma.follow.count({
      where: { followerId: user.id, status: 'ACCEPTED' },
    });

    const postsCount = await prisma.post.count({
      where: { userId: user.id },
    });

    // Check if we can show posts
    const canSeeContent = !user.isPrivate || currentUserId === user.id || isFollowing;

    let posts = [];
    if (canSeeContent) {
      posts = await prisma.post.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          media: {
            select: { url: true, type: true }
          },
          _count: {
            select: { likes: true, comments: true },
          },
        },
      });
    }

    return res.json({
      profile: {
        ...user,
        followersCount,
        followingCount,
        postsCount,
        isFollowing,
        isPending,
        isMe: currentUserId === user.id,
        canSeeContent,
        posts,
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, bio, isPrivate } = req.body;
    let avatarUrl = req.user.avatar;

    if (req.file) {
      // Upload avatar buffer to Cloudinary
      const result = await uploadStream(req.file.buffer, 'avatars');
      avatarUrl = result.secure_url;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name !== undefined ? name : undefined,
        bio: bio !== undefined ? bio : undefined,
        isPrivate: isPrivate !== undefined ? JSON.parse(isPrivate) : undefined,
        avatar: avatarUrl,
      },
    });

    return res.json({
      message: 'Profile updated successfully!',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        name: updatedUser.name,
        bio: updatedUser.bio,
        avatar: updatedUser.avatar,
        isPrivate: updatedUser.isPrivate,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.toggleFollow = async (req, res) => {
  try {
    const followerId = req.user.id;
    const { userId: followingId } = req.params;

    if (followerId === followingId) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: followingId },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Verify if blocked
    const blockRecord = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: followerId, blockedId: followingId },
          { blockerId: followingId, blockedId: followerId },
        ],
      },
    });

    if (blockRecord) {
      return res.status(403).json({ error: 'Cannot complete follow operation' });
    }

    // Check if follow record exists
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.follow.delete({
        where: {
          followerId_followingId: { followerId, followingId },
        },
      });

      // Clear notifications
      await prisma.notification.deleteMany({
        where: {
          recipientId: followingId,
          senderId: followerId,
          type: { in: ['FOLLOW', 'FOLLOW_REQUEST'] },
        },
      });

      return res.json({ message: 'Unfollowed successfully', status: 'UNFOLLOWED' });
    } else {
      // Follow. If target is private, status is PENDING, else ACCEPTED.
      const status = targetUser.isPrivate ? 'PENDING' : 'ACCEPTED';

      await prisma.follow.create({
        data: {
          followerId,
          followingId,
          status,
        },
      });

      // Create Notification
      const notifType = status === 'PENDING' ? 'FOLLOW_REQUEST' : 'FOLLOW';
      await prisma.notification.create({
        data: {
          recipientId: followingId,
          senderId: followerId,
          type: notifType,
        },
      });

      return res.json({
        message: status === 'PENDING' ? 'Follow request sent' : 'Followed successfully',
        status,
      });
    }
  } catch (err) {
    console.error('Toggle follow error:', err);
    return res.status(500).json({ error: 'Failed to follow user' });
  }
};

exports.getFollowRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const requests = await prisma.follow.findMany({
      where: {
        followingId: userId,
        status: 'PENDING',
      },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    return res.json({ requests });
  } catch (err) {
    console.error('Get follow requests error:', err);
    return res.status(500).json({ error: 'Failed to load follow requests' });
  }
};

exports.respondToFollowRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { followerId } = req.params;
    const { action } = req.body; // 'APPROVE' or 'REJECT'

    const request = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: userId,
        },
      },
    });

    if (!request || request.status !== 'PENDING') {
      return res.status(404).json({ error: 'No pending follow request from this user' });
    }

    if (action === 'APPROVE') {
      await prisma.follow.update({
        where: {
          followerId_followingId: {
            followerId,
            followingId: userId,
          },
        },
        data: { status: 'ACCEPTED' },
      });

      // Update notification
      await prisma.notification.updateMany({
        where: {
          recipientId: userId,
          senderId: followerId,
          type: 'FOLLOW_REQUEST',
        },
        data: { type: 'FOLLOW' },
      });

      return res.json({ message: 'Request approved successfully', action: 'APPROVED' });
    } else {
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId: userId,
          },
        },
      });

      await prisma.notification.deleteMany({
        where: {
          recipientId: userId,
          senderId: followerId,
          type: 'FOLLOW_REQUEST',
        },
      });

      return res.json({ message: 'Request rejected successfully', action: 'REJECTED' });
    }
  } catch (err) {
    console.error('Respond to follow request error:', err);
    return res.status(500).json({ error: 'Failed to process follow request' });
  }
};

exports.getSuggestedCreators = async (req, res) => {
  try {
    const userId = req.user.id;

    // Users that the current user already follows
    const followedRecords = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followedIds = followedRecords.map((r) => r.followingId);
    followedIds.push(userId); // exclude self

    // Check users blocker / blocked to exclude
    const blockRecords = await prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId },
          { blockedId: userId }
        ]
      }
    });

    const blockedIds = blockRecords.map(r => r.blockerId === userId ? r.blockedId : r.blockerId);
    const excludeIds = [...followedIds, ...blockedIds];

    // Recommends 5 suggested creators (who aren't followed/blocked, and aren't self, and not banned)
    const suggestions = await prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        isBanned: false,
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatar: true,
        verified: true,
      },
      take: 5,
    });

    return res.json({ suggestions });
  } catch (err) {
    console.error('Suggested creators error:', err);
    return res.status(500).json({ error: 'Failed to load suggested creators' });
  }
};

exports.getFollowersList = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const followerRecords = await prisma.follow.findMany({
      where: { followingId: user.id, status: 'ACCEPTED' },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            verified: true
          }
        }
      }
    });
    const followers = followerRecords.map(r => r.follower);
    return res.json({ followers });
  } catch (err) {
    console.error('Get followers error:', err);
    return res.status(500).json({ error: 'Failed to retrieve followers list' });
  }
};

exports.getFollowingList = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const followingRecords = await prisma.follow.findMany({
      where: { followerId: user.id, status: 'ACCEPTED' },
      include: {
        following: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            verified: true
          }
        }
      }
    });
    const following = followingRecords.map(r => r.following);
    return res.json({ following });
  } catch (err) {
    console.error('Get following error:', err);
    return res.status(500).json({ error: 'Failed to retrieve following list' });
  }
};

exports.getMutualFollowersList = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user.id;
    const targetUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() }
    });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Mutual followers: users who follow targetUser and are followed by currentUserId
    const mutuals = await prisma.user.findMany({
      where: {
        isBanned: false,
        followers: {
          some: {
            followingId: targetUser.id,
            status: 'ACCEPTED'
          }
        },
        following: {
          some: {
            followerId: currentUserId,
            status: 'ACCEPTED'
          }
        }
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatar: true,
        verified: true
      }
    });
    return res.json({ mutuals });
  } catch (err) {
    console.error('Get mutual followers error:', err);
    return res.status(500).json({ error: 'Failed to retrieve mutual followers list' });
  }
};
