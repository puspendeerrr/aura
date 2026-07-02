const User = require('../models/User');
const Follow = require('../models/Follow');
const Block = require('../models/Block');
const Story = require('../models/Story');
const StoryViewer = require('../models/StoryViewer');
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

    const storyObj = await Story.create({
      url: mediaUrl,
      user: userId,
      expiresAt,
    });

    const story = await Story.findById(storyObj._id)
      .populate('user', 'id username avatar');

    const formattedStory = {
      ...story.toJSON(),
      userId: story.user._id.toString()
    };

    return res.status(201).json({
      message: 'Story uploaded successfully!',
      story: formattedStory,
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
    const followingRecords = await Follow.find({
      follower: userId,
      status: 'ACCEPTED',
    });

    const feedUserIds = followingRecords.map((r) => r.following.toString());
    feedUserIds.push(userId); // include own stories

    // Filter exclusions (blocked profiles)
    const blocks = await Block.find({
      $or: [
        { blocker: userId },
        { blocked: userId }
      ]
    });
    const blockedUserIds = blocks.map(r => r.blocker.toString() === userId ? r.blocked.toString() : r.blocker.toString());
    const validFeedUserIds = feedUserIds.filter(id => !blockedUserIds.includes(id));

    // Filter banned users
    const bannedUsers = await User.find({ isBanned: true }, '_id');
    const bannedUserIds = bannedUsers.map(u => u._id.toString());
    const activeFeedUserIds = validFeedUserIds.filter(id => !bannedUserIds.includes(id));

    // Fetch active stories
    const activeStories = await Story.find({
      user: { $in: activeFeedUserIds },
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: 1 })
      .populate('user', 'id username avatar')
      .lean();

    // Group stories by User to make it easy for frontend rendering
    const groupedStoriesMap = {};

    for (const story of activeStories) {
      if (!story.user) continue;
      const uId = story.user._id.toString();
      if (!groupedStoriesMap[uId]) {
        groupedStoriesMap[uId] = {
          user: {
            id: story.user._id.toString(),
            username: story.user.username,
            avatar: story.user.avatar,
          },
          stories: [],
          hasUnviewed: false,
        };
      }

      const isViewed = await StoryViewer.exists({ story: story._id, user: userId });
      if (!isViewed && uId !== userId) {
        groupedStoriesMap[uId].hasUnviewed = true;
      }

      groupedStoriesMap[uId].stories.push({
        id: story._id.toString(),
        media: story.url,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        isViewed: !!isViewed,
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

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Record view in StoryViewer
    await StoryViewer.findOneAndUpdate(
      { story: storyId, user: userId },
      { $setOnInsert: { story: storyId, user: userId } },
      { upsert: true, new: true }
    );

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

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Only owner can check viewers
    if (story.user.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to view story statistics' });
    }

    const viewersRecords = await StoryViewer.find({ story: storyId })
      .populate('user', 'id username name avatar')
      .sort({ viewedAt: -1 })
      .lean();

    const viewers = viewersRecords.map((v) => {
      if (!v.user) return null;
      return {
        id: v.user._id.toString(),
        username: v.user.username,
        name: v.user.name,
        avatar: v.user.avatar,
      };
    }).filter(Boolean);

    return res.json({ viewers });
  } catch (err) {
    console.error('Get story viewers error:', err);
    return res.status(500).json({ error: 'Failed to fetch viewers' });
  }
};
