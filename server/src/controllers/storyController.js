const prisma = require('../config/db');
const { uploadStream } = require('../services/cloudinary');

exports.createStory = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'Story image is required' });
    }

    // Upload story file buffer to Cloudinary
    const result = await uploadStream(req.file.buffer, 'stories');
    const mediaUrl = result.secure_url;
    
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const story = await prisma.story.create({
      data: {
        url: mediaUrl,
        userId,
        expiresAt,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Story uploaded successfully!',
      story,
    });
  } catch (err) {
    console.error('Create story error:', err);
    return res.status(500).json({ error: 'Failed to upload story' });
  }
};

exports.getStoriesFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Get following list
    const followingRecords = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: 'ACCEPTED',
      },
      select: { followingId: true },
    });

    const feedUserIds = followingRecords.map((r) => r.followingId);
    feedUserIds.push(userId); // include own stories

    // Filter exclusions (blocked profiles)
    const blocks = await prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId },
          { blockedId: userId }
        ]
      }
    });
    const blockedUserIds = blocks.map(r => r.blockerId === userId ? r.blockedId : r.blockerId);
    const validFeedUserIds = feedUserIds.filter(id => !blockedUserIds.includes(id));

    // Fetch active stories
    const activeStories = await prisma.story.findMany({
      where: {
        userId: { in: validFeedUserIds },
        expiresAt: { gt: now },
        user: { isBanned: false },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        viewers: {
          where: { userId },
          select: { userId: true },
        },
      },
    });

    // Group stories by User to make it easy for frontend rendering
    const groupedStoriesMap = {};

    for (const story of activeStories) {
      const uId = story.userId;
      if (!groupedStoriesMap[uId]) {
        groupedStoriesMap[uId] = {
          user: story.user,
          stories: [],
          hasUnviewed: false,
        };
      }

      const isViewed = story.viewers.length > 0;
      if (!isViewed && story.userId !== userId) {
        groupedStoriesMap[uId].hasUnviewed = true;
      }

      groupedStoriesMap[uId].stories.push({
        id: story.id,
        media: story.url,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        isViewed,
      });
    }

    const groupedStories = Object.values(groupedStoriesMap);

    // Sort: current user first, then users with unviewed stories, then the rest
    groupedStories.sort((a, b) => {
      if (a.user.id === userId) return -1;
      if (b.user.id === userId) return 1;
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return 0;
    });

    return res.json({ stories: groupedStories });
  } catch (err) {
    console.error('Get stories feed error:', err);
    return res.status(500).json({ error: 'Failed to retrieve stories' });
  }
};

exports.viewStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;

    const story = await prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Record view in StoryViewer
    await prisma.storyViewer.upsert({
      where: {
        storyId_userId: {
          storyId,
          userId,
        },
      },
      update: {},
      create: {
        storyId,
        userId,
      },
    });

    return res.json({ message: 'Story marked as viewed' });
  } catch (err) {
    console.error('View story error:', err);
    return res.status(500).json({ error: 'Failed to record story view' });
  }
};

exports.getStoryViewers = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;

    const story = await prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Only owner can check viewers
    if (story.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to view story statistics' });
    }

    const viewers = await prisma.storyViewer.findMany({
      where: { storyId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { viewedAt: 'desc' },
    });

    return res.json({ viewers: viewers.map((v) => v.user) });
  } catch (err) {
    console.error('Get story viewers error:', err);
    return res.status(500).json({ error: 'Failed to fetch viewers' });
  }
};
