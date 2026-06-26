const prisma = require('../config/db');
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

    const uploadedMedia = await uploadPromises ? await Promise.all(uploadPromises) : [];

    // Create the post and the media records
    const post = await prisma.post.create({
      data: {
        caption,
        userId,
        media: {
          create: uploadedMedia
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
        media: true,
        _count: {
          select: { likes: true, comments: true },
        },
      },
    });

    // Parse and handle hashtags and mentions in background
    if (caption) {
      // Hashtags
      const hashtags = caption.match(/#(\w+)/g);
      if (hashtags) {
        for (const tag of hashtags) {
          const tagName = tag.replace('#', '').toLowerCase();
          await prisma.hashtag.upsert({
            where: { name: tagName },
            update: {
              posts: { connect: { id: post.id } }
            },
            create: {
              name: tagName,
              posts: { connect: { id: post.id } }
            }
          });
        }
      }

      // Mentions
      const mentions = caption.match(/@(\w+)/g);
      if (mentions) {
        for (const mention of mentions) {
          const username = mention.replace('@', '').toLowerCase();
          const mentionedUser = await prisma.user.findUnique({
            where: { username },
          });

          if (mentionedUser) {
            await prisma.mention.create({
              data: {
                postId: post.id,
                userId: mentionedUser.id
              }
            });

            // Create notification for mentioned user
            if (mentionedUser.id !== userId) {
              await prisma.notification.create({
                data: {
                  recipientId: mentionedUser.id,
                  senderId: userId,
                  type: 'MENTION',
                  postId: post.id,
                }
              });
            }
          }
        }
      }
    }

    return res.status(201).json({
      message: 'Post created successfully!',
      post,
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
    const blocks = await prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId },
          { blockedId: userId }
        ]
      }
    });
    const blockedUserIds = blocks.map(r => r.blockerId === userId ? r.blockedId : r.blockerId);

    // Mutes
    const mutes = await prisma.mute.findMany({
      where: { muterId: userId },
      select: { mutedId: true }
    });
    const mutedUserIds = mutes.map(r => r.mutedId);

    // Filter exclusions
    const exclusions = [...blockedUserIds, ...mutedUserIds];

    // Retrieve followers list
    const followingRecords = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: 'ACCEPTED',
      },
      select: { followingId: true },
    });

    const feedUserIds = followingRecords.map((r) => r.followingId);
    feedUserIds.push(userId); // include current user's posts in feed

    // Filters out posts from blocked or muted users
    const posts = await prisma.post.findMany({
      where: {
        userId: { 
          in: feedUserIds,
          notIn: exclusions
        },
        user: { isBanned: false },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
        media: true,
        likes: {
          where: { userId },
          select: { userId: true },
        },
        saves: {
          where: { userId },
          select: { userId: true },
        },
        _count: {
          select: { likes: true, comments: true },
        },
      },
    });

    // Write PostView logs (AI engine data preparation)
    const viewLogs = posts.map((post) => ({
      postId: post.id,
      userId: userId,
      watchTime: 3, // mock 3s initial scroll watch time
    }));

    if (viewLogs.length > 0) {
      await prisma.postView.createMany({
        data: viewLogs,
        skipDuplicates: true,
      });
    }

    const formattedPosts = posts.map((post) => ({
      ...post,
      isLiked: post.likes.length > 0,
      isSaved: post.saves.length > 0,
      likes: undefined,
      saves: undefined,
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
    const blocks = await prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId },
          { blockedId: userId }
        ]
      }
    });
    const blockedUserIds = blocks.map(r => r.blockerId === userId ? r.blockedId : r.blockerId);

    const mutes = await prisma.mute.findMany({
      where: { muterId: userId },
      select: { mutedId: true }
    });
    const mutedUserIds = mutes.map(r => r.mutedId);
    const exclusions = [...blockedUserIds, ...mutedUserIds];

    const posts = await prisma.post.findMany({
      where: {
        userId: { notIn: exclusions },
        user: {
          isPrivate: false,
          isBanned: false,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
        media: true,
        likes: {
          where: { userId },
          select: { userId: true },
        },
        _count: {
          select: { likes: true, comments: true },
        },
      },
    });

    const formattedPosts = posts.map((post) => ({
      ...post,
      isLiked: post.likes.length > 0,
      likes: undefined,
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

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
            isPrivate: true,
          },
        },
        media: true,
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                verified: true,
              },
            },
          },
        },
        likes: {
          where: { userId },
          select: { userId: true },
        },
        saves: {
          where: { userId },
          select: { userId: true },
        },
        _count: {
          select: { likes: true, comments: true },
        },
      },
    });

    if (!post || post.user.isBanned) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Block verification
    const blockRecord = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: post.userId },
          { blockerId: post.userId, blockedId: userId }
        ]
      }
    });

    if (blockRecord) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Privacy restrictions
    if (post.user.isPrivate && post.user.id !== userId) {
      const isFollowing = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: userId,
            followingId: post.user.id,
          },
        },
      });

      if (isFollowing?.status !== 'ACCEPTED') {
        return res.status(403).json({ error: 'This account is private. Follow to view posts.' });
      }
    }

    // Log engagement metrics
    await prisma.postView.create({
      data: {
        postId: post.id,
        userId: userId,
        watchTime: 8, // mock detailed post watch view duration
      }
    });

    const formattedPost = {
      ...post,
      isLiked: post.likes.length > 0,
      isSaved: post.saves.length > 0,
      likes: undefined,
      saves: undefined,
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

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this post' });
    }

    await prisma.post.delete({
      where: { id: postId },
    });

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

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this post' });
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { caption },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
        media: true,
        _count: {
          select: { likes: true, comments: true },
        },
      },
    });

    if (caption) {
      await prisma.mention.deleteMany({ where: { postId } });

      const hashtags = caption.match(/#(\w+)/g);
      if (hashtags) {
        for (const tag of hashtags) {
          const tagName = tag.replace('#', '').toLowerCase();
          await prisma.hashtag.upsert({
            where: { name: tagName },
            update: {
              posts: { connect: { id: post.id } }
            },
            create: {
              name: tagName,
              posts: { connect: { id: post.id } }
            }
          });
        }
      }

      const mentions = caption.match(/@(\w+)/g);
      if (mentions) {
        for (const mention of mentions) {
          const username = mention.replace('@', '').toLowerCase();
          const mentionedUser = await prisma.user.findUnique({
            where: { username },
          });

          if (mentionedUser) {
            await prisma.mention.create({
              data: {
                postId: post.id,
                userId: mentionedUser.id
              }
            });

            if (mentionedUser.id !== userId) {
              await prisma.notification.create({
                data: {
                  recipientId: mentionedUser.id,
                  senderId: userId,
                  type: 'MENTION',
                  postId: post.id,
                }
              });
            }
          }
        }
      }
    }

    return res.json({
      message: 'Post updated successfully!',
      post: updatedPost,
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

    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: { userId, postId },
      },
    });

    if (existingLike) {
      await prisma.like.delete({
        where: {
          userId_postId: { userId, postId },
        },
      });

      await prisma.notification.deleteMany({
        where: {
          recipientId: post.userId,
          senderId: userId,
          type: 'LIKE',
          postId,
        },
      });

      return res.json({ message: 'Post unliked', isLiked: false });
    } else {
      await prisma.like.create({
        data: { userId, postId },
      });

      if (post.userId !== userId) {
        await prisma.notification.create({
          data: {
            recipientId: post.userId,
            senderId: userId,
            type: 'LIKE',
            postId,
          },
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

    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = await prisma.comment.create({
      data: {
        text,
        postId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
      },
    });

    if (post.userId !== userId) {
      await prisma.notification.create({
        data: {
          recipientId: post.userId,
          senderId: userId,
          type: 'COMMENT',
          postId,
        },
      });
    }

    // Process mentions in comment text
    const mentions = text.match(/@(\w+)/g);
    if (mentions) {
      for (const mention of mentions) {
        const username = mention.replace('@', '').toLowerCase();
        const mentionedUser = await prisma.user.findUnique({
          where: { username },
        });

        if (mentionedUser && mentionedUser.id !== userId && mentionedUser.id !== post.userId) {
          await prisma.notification.create({
            data: {
              recipientId: mentionedUser.id,
              senderId: userId,
              type: 'MENTION',
              postId,
            },
          });
        }
      }
    }

    return res.status(201).json({
      message: 'Comment added successfully!',
      comment,
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

    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const existingSave = await prisma.save.findUnique({
      where: {
        userId_postId: { userId, postId },
      },
    });

    if (existingSave) {
      await prisma.save.delete({
        where: {
          userId_postId: { userId, postId },
        },
      });
      return res.json({ message: 'Post unsaved', isSaved: false });
    } else {
      await prisma.save.create({
        data: { userId, postId },
      });
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

    const savedRecords = await prisma.save.findMany({
      where: { userId },
      include: {
        post: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                verified: true,
              },
            },
            media: true,
            _count: {
              select: { likes: true, comments: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const posts = savedRecords.map((record) => record.post);

    return res.json({ posts });
  } catch (err) {
    console.error('Get saved posts error:', err);
    return res.status(500).json({ error: 'Failed to load saved posts' });
  }
};

exports.searchPosts = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ posts: [] });

    const posts = await prisma.post.findMany({
      where: {
        caption: { contains: q, mode: 'insensitive' },
        user: {
          isPrivate: false,
          isBanned: false,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
        media: true,
        _count: {
          select: { likes: true, comments: true },
        },
      },
    });

    return res.json({ posts });
  } catch (err) {
    console.error('Search posts error:', err);
    return res.status(500).json({ error: 'Failed to search posts' });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q.toLowerCase(), mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
        isBanned: false,
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatar: true,
        verified: true,
      },
      take: 20,
    });

    return res.json({ users });
  } catch (err) {
    console.error('Search users error:', err);
    return res.status(500).json({ error: 'Failed to search users' });
  }
};
