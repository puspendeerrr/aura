const User = require('../models/User');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Save = require('../models/Save');
const Block = require('../models/Block');
const Mute = require('../models/Mute');
const Hashtag = require('../models/Hashtag');
const Mention = require('../models/Mention');
const PostView = require('../models/PostView');
const Notification = require('../models/Notification');
const Follow = require('../models/Follow');
const { uploadStream } = require('../services/cloudinary');

exports.createPost = async (req, res) => {
  try {
    const userId = req.user.id;
    const { caption } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one media file is required to post' });
    }

    // Upload each media buffer to Cloudinary in parallel
    const uploadPromises = req.files.map((file) => {
      const type = file.mimetype.startsWith('video') ? 'video' : 'image';
      return uploadStream(file.buffer, 'posts', type).then(result => ({
        url: result.secure_url,
        type: type.toUpperCase()
      }));
    });

    const uploadedMedia = uploadPromises ? await Promise.all(uploadPromises) : [];

    // Create the post and the media records
    const postObj = await Post.create({
      caption,
      user: userId,
      media: uploadedMedia,
    });

    const post = await Post.findById(postObj._id)
      .populate('user', 'id username name avatar verified');

    const likesCount = 0;
    const commentsCount = 0;

    const formattedPost = {
      ...post.toJSON(),
      _count: { likes: likesCount, comments: commentsCount },
    };

    // Parse and handle hashtags and mentions in background
    if (caption) {
      // Hashtags
      const hashtags = caption.match(/#(\w+)/g);
      if (hashtags) {
        for (const tag of hashtags) {
          const tagName = tag.replace('#', '').toLowerCase();
          await Hashtag.findOneAndUpdate(
            { name: tagName },
            { $addToSet: { posts: post._id } },
            { upsert: true }
          );
        }
      }

      // Mentions
      const mentions = caption.match(/@(\w+)/g);
      if (mentions) {
        for (const mention of mentions) {
          const username = mention.replace('@', '').toLowerCase();
          const mentionedUser = await User.findOne({ username });

          if (mentionedUser) {
            await Mention.create({
              post: post._id,
              user: mentionedUser._id,
            });

            // Create notification for mentioned user
            if (mentionedUser._id.toString() !== userId.toString()) {
              await Notification.create({
                recipient: mentionedUser._id,
                sender: userId,
                type: 'MENTION',
                postId: post._id,
              });
            }
          }
        }
      }
    }

    return res.status(201).json({
      message: 'Post created successfully!',
      post: formattedPost,
    });
  } catch (err) {
    console.error('Create post error:', err);
    return res.status(500).json({ error: 'Failed to create post' });
  }
};

exports.getFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // Retrieve users blocked by or blocker of the current user
    const blocks = await Block.find({
      $or: [
        { blocker: userId },
        { blocked: userId }
      ]
    });
    const blockedUserIds = blocks.map(r => r.blocker.toString() === userId ? r.blocked.toString() : r.blocker.toString());

    // Mutes
    const mutes = await Mute.find({ muter: userId });
    const mutedUserIds = mutes.map(r => r.muted.toString());

    // Filter exclusions
    const exclusions = [...blockedUserIds, ...mutedUserIds];

    // Retrieve followers list
    const followingRecords = await Follow.find({
      follower: userId,
      status: 'ACCEPTED',
    });

    const feedUserIds = followingRecords.map((r) => r.following.toString());
    feedUserIds.push(userId); // include current user's posts in feed

    // Filters out banned users
    const bannedUsers = await User.find({ isBanned: true }, '_id');
    const bannedUserIds = bannedUsers.map(u => u._id.toString());
    const finalUserIds = feedUserIds.filter(id => !exclusions.includes(id) && !bannedUserIds.includes(id));

    const posts = await Post.find({ user: { $in: finalUserIds } })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate('user', 'id username name avatar verified')
      .lean();

    // Write PostView logs (AI engine data preparation)
    const viewLogs = posts.map((post) => ({
      post: post._id,
      user: userId,
      watchTime: 3, // mock 3s initial scroll watch time
    }));

    if (viewLogs.length > 0) {
      await PostView.insertMany(viewLogs);
    }

    const formattedPosts = await Promise.all(posts.map(async (post) => {
      const isLiked = await Like.exists({ user: userId, post: post._id });
      const isSaved = await Save.exists({ user: userId, post: post._id });
      const likesCount = await Like.countDocuments({ post: post._id });
      const commentsCount = await Comment.countDocuments({ post: post._id });

      return {
        ...post,
        id: post._id.toString(),
        isLiked: !!isLiked,
        isSaved: !!isSaved,
        media: post.media ? post.media.map(m => ({ ...m, id: m._id.toString() })) : [],
        _count: { likes: likesCount, comments: commentsCount }
      };
    }));

    return res.json({ posts: formattedPosts });
  } catch (err) {
    console.error('Get feed error:', err);
    return res.status(500).json({ error: 'Failed to load feed' });
  }
};

exports.getExplore = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;

    // Filter exclusions (Blocks + Mutes)
    const blocks = await Block.find({
      $or: [
        { blocker: userId },
        { blocked: userId }
      ]
    });
    const blockedUserIds = blocks.map(r => r.blocker.toString() === userId ? r.blocked.toString() : r.blocker.toString());

    const mutes = await Mute.find({ muter: userId });
    const mutedUserIds = mutes.map(r => r.muted.toString());
    const exclusions = [...blockedUserIds, ...mutedUserIds];

    // Filter private and banned users
    const restrictedUsers = await User.find({
      $or: [
        { isPrivate: true },
        { isBanned: true }
      ]
    }, '_id');
    const restrictedUserIds = restrictedUsers.map(u => u._id.toString());
    const finalExclusions = [...new Set([...exclusions, ...restrictedUserIds])];

    const posts = await Post.find({ user: { $nin: finalExclusions } })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate('user', 'id username name avatar verified')
      .lean();

    const formattedPosts = await Promise.all(posts.map(async (post) => {
      const isLiked = await Like.exists({ user: userId, post: post._id });
      const likesCount = await Like.countDocuments({ post: post._id });
      const commentsCount = await Comment.countDocuments({ post: post._id });

      return {
        ...post,
        id: post._id.toString(),
        isLiked: !!isLiked,
        media: post.media ? post.media.map(m => ({ ...m, id: m._id.toString() })) : [],
        _count: { likes: likesCount, comments: commentsCount }
      };
    }));

    return res.json({ posts: formattedPosts });
  } catch (err) {
    console.error('Get explore error:', err);
    return res.status(500).json({ error: 'Failed to load explore' });
  }
};

exports.getPostDetails = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findById(postId)
      .populate('user', 'id username name avatar verified isPrivate isBanned')
      .lean();

    if (!post || post.user.isBanned) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Block verification
    const blockRecord = await Block.findOne({
      $or: [
        { blocker: userId, blocked: post.user._id },
        { blocker: post.user._id, blocked: userId }
      ]
    });

    if (blockRecord) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Privacy restrictions
    if (post.user.isPrivate && post.user._id.toString() !== userId) {
      const isFollowing = await Follow.findOne({
        follower: userId,
        following: post.user._id,
        status: 'ACCEPTED',
      });

      if (!isFollowing) {
        return res.status(403).json({ error: 'This account is private. Follow to view posts.' });
      }
    }

    // Log engagement metrics
    await PostView.create({
      post: post._id,
      user: userId,
      watchTime: 8,
    });

    // Populate comments
    const commentsData = await Comment.find({ post: post._id })
      .sort({ createdAt: 1 })
      .populate('user', 'id username name avatar verified')
      .lean();

    const comments = commentsData
      .filter(c => !c.parentComment)
      .map(c => {
        const replies = commentsData
          .filter(r => r.parentComment && r.parentComment.toString() === c._id.toString())
          .map(r => ({
            ...r,
            id: r._id.toString(),
            user: r.user ? { ...r.user, id: r.user._id.toString() } : null,
            likesCount: r.likes ? r.likes.length : 0,
            isLiked: r.likes ? r.likes.some(l => l.toString() === userId) : false,
          }));
        return {
          ...c,
          id: c._id.toString(),
          user: c.user ? { ...c.user, id: c.user._id.toString() } : null,
          likesCount: c.likes ? c.likes.length : 0,
          isLiked: c.likes ? c.likes.some(l => l.toString() === userId) : false,
          replies,
        };
      });

    const isLiked = await Like.exists({ user: userId, post: post._id });
    const isSaved = await Save.exists({ user: userId, post: post._id });
    const likesCount = await Like.countDocuments({ post: post._id });
    const commentsCount = comments.length;

    const formattedPost = {
      ...post,
      id: post._id.toString(),
      user: {
        ...post.user,
        id: post.user._id.toString()
      },
      comments,
      isLiked: !!isLiked,
      isSaved: !!isSaved,
      media: post.media ? post.media.map(m => ({ ...m, id: m._id.toString() })) : [],
      _count: { likes: likesCount, comments: commentsCount }
    };

    return res.json({ post: formattedPost });
  } catch (err) {
    console.error('Get post details error:', err);
    return res.status(500).json({ error: 'Failed to load post details' });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.user.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this post' });
    }

    await Post.deleteOne({ _id: postId });
    await Like.deleteMany({ post: postId });
    await Comment.deleteMany({ post: postId });
    await Save.deleteMany({ post: postId });
    await Notification.deleteMany({ postId });

    return res.json({ message: 'Post deleted successfully!' });
  } catch (err) {
    console.error('Delete post error:', err);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
};

exports.updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const { caption } = req.body;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.user.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this post' });
    }

    post.caption = caption;
    await post.save();

    if (caption) {
      await Mention.deleteMany({ post: postId });

      const hashtags = caption.match(/#(\w+)/g);
      if (hashtags) {
        for (const tag of hashtags) {
          const tagName = tag.replace('#', '').toLowerCase();
          await Hashtag.findOneAndUpdate(
            { name: tagName },
            { $addToSet: { posts: post._id } },
            { upsert: true }
          );
        }
      }

      const mentions = caption.match(/@(\w+)/g);
      if (mentions) {
        for (const mention of mentions) {
          const username = mention.replace('@', '').toLowerCase();
          const mentionedUser = await User.findOne({ username });

          if (mentionedUser) {
            await Mention.create({
              post: post._id,
              user: mentionedUser._id,
            });

            if (mentionedUser._id.toString() !== userId) {
              await Notification.create({
                recipient: mentionedUser._id,
                sender: userId,
                type: 'MENTION',
                postId: post._id,
              });
            }
          }
        }
      }
    }

    const updatedPost = await Post.findById(postId)
      .populate('user', 'id username name avatar verified')
      .lean();

    const likesCount = await Like.countDocuments({ post: postId });
    const commentsCount = await Comment.countDocuments({ post: postId });

    const formattedPost = {
      ...updatedPost,
      id: updatedPost._id.toString(),
      user: {
        ...updatedPost.user,
        id: updatedPost.user._id.toString()
      },
      media: updatedPost.media ? updatedPost.media.map(m => ({ ...m, id: m._id.toString() })) : [],
      _count: { likes: likesCount, comments: commentsCount }
    };

    return res.json({
      message: 'Post updated successfully!',
      post: formattedPost,
    });
  } catch (err) {
    console.error('Update post error:', err);
    return res.status(500).json({ error: 'Failed to update post' });
  }
};

exports.toggleLike = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const existingLike = await Like.findOne({ user: userId, post: postId });

    if (existingLike) {
      await Like.deleteOne({ _id: existingLike._id });

      await Notification.deleteMany({
        recipient: post.user,
        sender: userId,
        type: 'LIKE',
        postId,
      });

      return res.json({ message: 'Post unliked', isLiked: false });
    } else {
      await Like.create({ user: userId, post: postId });

      if (post.user.toString() !== userId) {
        await Notification.create({
          recipient: post.user,
          sender: userId,
          type: 'LIKE',
          postId,
        });
      }

      return res.json({ message: 'Post liked', isLiked: true });
    }
  } catch (err) {
    console.error('Toggle like error:', err);
    return res.status(500).json({ error: 'Failed to like/unlike post' });
  }
};

exports.addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const commentObj = await Comment.create({
      text,
      post: postId,
      user: userId,
    });

    const comment = await Comment.findById(commentObj._id)
      .populate('user', 'id username name avatar verified')
      .lean();

    const formattedComment = {
      ...comment,
      id: comment._id.toString(),
      user: {
        ...comment.user,
        id: comment.user._id.toString()
      }
    };

    if (post.user.toString() !== userId) {
      await Notification.create({
        recipient: post.user,
        sender: userId,
        type: 'COMMENT',
        postId,
      });
    }

    // Process mentions in comment text
    const mentions = text.match(/@(\w+)/g);
    if (mentions) {
      for (const mention of mentions) {
        const username = mention.replace('@', '').toLowerCase();
        const mentionedUser = await User.findOne({ username });

        if (mentionedUser && mentionedUser._id.toString() !== userId && mentionedUser._id.toString() !== post.user.toString()) {
          await Notification.create({
            recipient: mentionedUser._id,
            sender: userId,
            type: 'MENTION',
            postId,
          });
        }
      }
    }

    return res.status(201).json({
      message: 'Comment added successfully!',
      comment: formattedComment,
    });
  } catch (err) {
    console.error('Add comment error:', err);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
};

exports.toggleSave = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const existingSave = await Save.findOne({ user: userId, post: postId });

    if (existingSave) {
      await Save.deleteOne({ _id: existingSave._id });
      return res.json({ message: 'Post unsaved', isSaved: false });
    } else {
      await Save.create({ user: userId, post: postId });
      return res.json({ message: 'Post saved', isSaved: true });
    }
  } catch (err) {
    console.error('Toggle save error:', err);
    return res.status(500).json({ error: 'Failed to save post' });
  }
};

exports.getSavedPosts = async (req, res) => {
  try {
    const userId = req.user.id;

    const savedRecords = await Save.find({ user: userId })
      .populate({
        path: 'post',
        populate: {
          path: 'user',
          select: 'id username name avatar verified'
        }
      })
      .sort({ createdAt: -1 })
      .lean();

    const posts = await Promise.all(savedRecords.map(async (record) => {
      const p = record.post;
      if (!p) return null;
      const likesCount = await Like.countDocuments({ post: p._id });
      const commentsCount = await Comment.countDocuments({ post: p._id });
      return {
        ...p,
        id: p._id.toString(),
        user: p.user ? {
          ...p.user,
          id: p.user._id.toString()
        } : null,
        media: p.media ? p.media.map(m => ({ ...m, id: m._id.toString() })) : [],
        _count: { likes: likesCount, comments: commentsCount }
      };
    }));

    return res.json({ posts: posts.filter(Boolean) });
  } catch (err) {
    console.error('Get saved posts error:', err);
    return res.status(500).json({ error: 'Failed to load saved posts' });
  }
};

exports.searchPosts = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ posts: [] });

    // Exclude banned users
    const bannedUsers = await User.find({ isBanned: true }, '_id');
    const bannedUserIds = bannedUsers.map(u => u._id);

    const posts = await Post.find({
      caption: { $regex: q, $options: 'i' },
      user: { $nin: bannedUserIds }
    })
      .populate('user', 'id username name avatar verified isPrivate')
      .lean();

    // Filter out private accounts
    const publicPosts = posts.filter(p => p.user && !p.user.isPrivate);

    const formattedPosts = await Promise.all(publicPosts.map(async (post) => {
      const likesCount = await Like.countDocuments({ post: post._id });
      const commentsCount = await Comment.countDocuments({ post: post._id });
      return {
        ...post,
        id: post._id.toString(),
        user: {
          ...post.user,
          id: post.user._id.toString()
        },
        media: post.media ? post.media.map(m => ({ ...m, id: m._id.toString() })) : [],
        _count: { likes: likesCount, comments: commentsCount }
      };
    }));

    return res.json({ posts: formattedPosts });
  } catch (err) {
    console.error('Search posts error:', err);
    return res.status(500).json({ error: 'Failed to search posts' });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ users: [] });

    const users = await User.find({
      $or: [
        { username: { $regex: q.toLowerCase(), $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ],
      isBanned: false,
    })
      .select('id username name avatar verified')
      .limit(20);

    return res.json({ users });
  } catch (err) {
    console.error('Search users error:', err);
    return res.status(500).json({ error: 'Failed to search users' });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { commentId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.user.toString() !== userId) {
      return res.status(403).json({ error: 'You are not authorized to edit this comment' });
    }

    comment.text = text;
    await comment.save();

    const updated = await Comment.findById(commentId).populate('user', 'id username name avatar verified');
    return res.json({ message: 'Comment updated successfully', comment: updated });
  } catch (err) {
    console.error('Update comment error:', err);
    return res.status(500).json({ error: 'Failed to update comment' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.user.toString() !== userId) {
      return res.status(403).json({ error: 'You are not authorized to delete this comment' });
    }

    // Delete the comment and all its replies (parentComment: commentId)
    await Comment.deleteMany({ $or: [{ _id: commentId }, { parentComment: commentId }] });

    return res.json({ message: 'Comment and its replies deleted successfully' });
  } catch (err) {
    console.error('Delete comment error:', err);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
};

exports.toggleLikeComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const hasLiked = comment.likes && comment.likes.includes(userId);
    if (hasLiked) {
      comment.likes = comment.likes.filter(id => id.toString() !== userId);
    } else {
      if (!comment.likes) comment.likes = [];
      comment.likes.push(userId);

      // Send notification to comment owner
      if (comment.user.toString() !== userId) {
        await Notification.create({
          recipient: comment.user,
          sender: userId,
          type: 'LIKE',
          postId: comment.post,
        });
      }
    }
    await comment.save();

    return res.json({
      message: hasLiked ? 'Comment unliked' : 'Comment liked',
      likesCount: comment.likes.length,
      isLiked: !hasLiked,
    });
  } catch (err) {
    console.error('Like comment error:', err);
    return res.status(500).json({ error: 'Failed to toggle comment like' });
  }
};

exports.replyToComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { postId, commentId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Reply text cannot be empty' });
    }

    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return res.status(404).json({ error: 'Parent comment not found' });
    }

    const replyObj = await Comment.create({
      text,
      post: postId,
      user: userId,
      parentComment: commentId,
    });

    const reply = await Comment.findById(replyObj._id).populate('user', 'id username name avatar verified');

    // Notify parent comment owner
    if (parentComment.user.toString() !== userId) {
      await Notification.create({
        recipient: parentComment.user,
        sender: userId,
        type: 'COMMENT',
        postId,
      });
    }

    // Parse mentions in reply
    const mentions = text.match(/@(\w+)/g);
    if (mentions) {
      for (const mention of mentions) {
        const username = mention.replace('@', '').toLowerCase();
        const mentionedUser = await User.findOne({ username });

        if (mentionedUser && mentionedUser._id.toString() !== userId && mentionedUser._id.toString() !== parentComment.user.toString()) {
          await Notification.create({
            recipient: mentionedUser._id,
            sender: userId,
            type: 'MENTION',
            postId,
          });
        }
      }
    }

    return res.status(201).json({
      message: 'Reply added successfully',
      reply: {
        ...reply.toJSON(),
        id: reply._id.toString(),
        user: {
          ...reply.user.toJSON(),
          id: reply.user._id.toString(),
        }
      },
    });
  } catch (err) {
    console.error('Reply to comment error:', err);
    return res.status(500).json({ error: 'Failed to reply to comment' });
  }
};
