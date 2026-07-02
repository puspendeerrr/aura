const User = require('../models/User');
const Follow = require('../models/Follow');
const Block = require('../models/Block');
const Mute = require('../models/Mute');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const { uploadStream } = require('../services/cloudinary');

exports.getProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user.id;

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify blocking status
    const isBlocked = await Block.findOne({
      blocker: user._id,
      blocked: currentUserId,
    });

    if (isBlocked) {
      return res.status(403).json({ error: 'Access denied: Profile unavailable' });
    }

    // Check relationship status
    const followRecord = await Follow.findOne({
      follower: currentUserId,
      following: user._id,
    });

    const isFollowing = followRecord?.status === 'ACCEPTED';
    const isPending = followRecord?.status === 'PENDING';

    const followersCount = await Follow.countDocuments({ following: user._id, status: 'ACCEPTED' });
    const followingCount = await Follow.countDocuments({ follower: user._id, status: 'ACCEPTED' });
    const postsCount = await Post.countDocuments({ user: user._id });

    // Check if we can show posts
    const canSeeContent = !user.isPrivate || currentUserId === user.id.toString() || isFollowing;

    let posts = [];
    if (canSeeContent) {
      const postsData = await Post.find({ user: user._id })
        .sort({ createdAt: -1 })
        .lean();

      posts = await Promise.all(postsData.map(async (p) => {
        const likesCount = await Like.countDocuments({ post: p._id });
        const commentsCount = await Comment.countDocuments({ post: p._id });
        return {
          ...p,
          id: p._id.toString(),
          _count: { likes: likesCount, comments: commentsCount }
        };
      }));
    }

    return res.json({
      profile: {
        id: user.id,
        username: user.username,
        name: user.name,
        bio: user.bio,
        avatar: user.avatar,
        isPrivate: user.isPrivate,
        verified: user.verified,
        createdAt: user.createdAt,
        followersCount,
        followingCount,
        postsCount,
        isFollowing,
        isPending,
        isMe: currentUserId === user.id.toString(),
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

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (isPrivate !== undefined) updateData.isPrivate = JSON.parse(isPrivate);
    updateData.avatar = avatarUrl;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    );

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

    const targetUser = await User.findById(followingId);

    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Verify if blocked
    const blockRecord = await Block.findOne({
      $or: [
        { blocker: followerId, blocked: followingId },
        { blocker: followingId, blocked: followerId },
      ],
    });

    if (blockRecord) {
      return res.status(403).json({ error: 'Cannot complete follow operation' });
    }

    // Check if follow record exists
    const existingFollow = await Follow.findOne({
      follower: followerId,
      following: followingId,
    });

    if (existingFollow) {
      // Unfollow
      await Follow.deleteOne({
        follower: followerId,
        following: followingId,
      });

      // Clear notifications
      await Notification.deleteMany({
        recipient: followingId,
        sender: followerId,
        type: { $in: ['FOLLOW', 'FOLLOW_REQUEST'] },
      });

      return res.json({ message: 'Unfollowed successfully', status: 'UNFOLLOWED' });
    } else {
      // Follow. If target is private, status is PENDING, else ACCEPTED.
      const status = targetUser.isPrivate ? 'PENDING' : 'ACCEPTED';

      await Follow.create({
        follower: followerId,
        following: followingId,
        status,
      });

      // Create Notification
      const notifType = status === 'PENDING' ? 'FOLLOW_REQUEST' : 'FOLLOW';
      await Notification.create({
        recipient: followingId,
        sender: followerId,
        type: notifType,
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

    const requests = await Follow.find({
      following: userId,
      status: 'PENDING',
    }).populate('follower', 'id username name avatar');

    // Adapt schema mapping so `follower` contains id instead of _id
    const adaptedRequests = requests.map(reqRecord => {
      const follower = reqRecord.follower;
      return {
        id: reqRecord._id.toString(),
        follower: follower ? {
          id: follower._id.toString(),
          username: follower.username,
          name: follower.name,
          avatar: follower.avatar,
        } : null
      };
    });

    return res.json({ requests: adaptedRequests });
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

    const request = await Follow.findOne({
      follower: followerId,
      following: userId,
      status: 'PENDING',
    });

    if (!request) {
      return res.status(404).json({ error: 'No pending follow request from this user' });
    }

    if (action === 'APPROVE') {
      request.status = 'ACCEPTED';
      await request.save();

      // Update notification
      await Notification.updateMany(
        {
          recipient: userId,
          sender: followerId,
          type: 'FOLLOW_REQUEST',
        },
        { $set: { type: 'FOLLOW' } }
      );

      return res.json({ message: 'Request approved successfully', action: 'APPROVED' });
    } else {
      await Follow.deleteOne({
        follower: followerId,
        following: userId,
      });

      await Notification.deleteMany({
        recipient: userId,
        sender: followerId,
        type: 'FOLLOW_REQUEST',
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
    const followedRecords = await Follow.find({ follower: userId });
    const followedIds = followedRecords.map((r) => r.following);
    followedIds.push(userId); // exclude self

    // Check users blocker / blocked to exclude
    const blockRecords = await Block.find({
      $or: [
        { blocker: userId },
        { blocked: userId }
      ]
    });

    const blockedIds = blockRecords.map(r => r.blocker.toString() === userId ? r.blocked : r.blocker);
    const excludeIds = [...followedIds, ...blockedIds];

    // Recommends 5 suggested creators (who aren't followed/blocked, aren't self, and not banned)
    const suggestions = await User.find({
      _id: { $nin: excludeIds },
      isBanned: false,
    })
      .select('id username name avatar verified')
      .limit(5);

    return res.json({ suggestions });
  } catch (err) {
    console.error('Suggested creators error:', err);
    return res.status(500).json({ error: 'Failed to load suggested creators' });
  }
};

exports.getFollowersList = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const followerRecords = await Follow.find({ following: user._id, status: 'ACCEPTED' })
      .populate('follower', 'id username name avatar verified');

    const followers = followerRecords.map(r => r.follower).filter(Boolean);
    return res.json({ followers });
  } catch (err) {
    console.error('Get followers error:', err);
    return res.status(500).json({ error: 'Failed to retrieve followers list' });
  }
};

exports.getFollowingList = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const followingRecords = await Follow.find({ follower: user._id, status: 'ACCEPTED' })
      .populate('following', 'id username name avatar verified');

    const following = followingRecords.map(r => r.following).filter(Boolean);
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
    const targetUser = await User.findOne({ username: username.toLowerCase() });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mutual followers: users who follow targetUser and are followed by currentUserId
    // Let's find accepted follows where following = targetUser._id
    const targetFollowersRecords = await Follow.find({ following: targetUser._id, status: 'ACCEPTED' });
    const targetFollowersIds = targetFollowersRecords.map(r => r.follower.toString());

    // Also we follow them: following = followerId in targetFollowersIds, follower = currentUserId
    const mutualFollowRecords = await Follow.find({
      follower: currentUserId,
      following: { $in: targetFollowersIds },
      status: 'ACCEPTED'
    }).populate('following', 'id username name avatar verified');

    const mutuals = mutualFollowRecords.map(r => r.following).filter(Boolean);
    return res.json({ mutuals });
  } catch (err) {
    console.error('Get mutual followers error:', err);
    return res.status(500).json({ error: 'Failed to retrieve mutual followers list' });
  }
};

const bcrypt = require('bcrypt');

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect old password' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    user.passwordHash = passwordHash;
    await user.save();

    return res.json({ message: 'Password changed successfully!' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete user's posts, follows, comments, notifications, stories, blocks, mutes
    await User.deleteOne({ _id: userId });
    await Post.deleteMany({ user: userId });
    await Comment.deleteMany({ user: userId });
    await Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] });
    await Block.deleteMany({ $or: [{ blocker: userId }, { blocked: userId }] });
    await Mute.deleteMany({ $or: [{ muter: userId }, { muted: userId }] });
    await Story.deleteMany({ user: userId });
    await Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] });

    return res.json({ message: 'Account deleted successfully!' });
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
};
