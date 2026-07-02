const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Report = require('../models/Report');

exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalPosts = await Post.countDocuments();
    const totalComments = await Comment.countDocuments();
    const totalReports = await Report.countDocuments({ status: 'PENDING' });

    // Simple analytics dashboard mock representation
    return res.json({
      stats: {
        totalUsers,
        totalPosts,
        totalComments,
        pendingReports: totalReports,
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ error: 'Failed to retrieve stats' });
  }
};

exports.getUsersList = async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select('id email phone username name isPrivate isBanned banReason createdAt')
      .lean();

    const formattedUsers = users.map(u => ({
      ...u,
      id: u._id.toString()
    }));

    return res.json({ users: formattedUsers });
  } catch (err) {
    console.error('Admin user list error:', err);
    return res.status(500).json({ error: 'Failed to load user list' });
  }
};

exports.getReports = async (req, res) => {
  try {
    const reports = await Report.find({ status: 'PENDING' })
      .sort({ createdAt: -1 })
      .populate('reporter', 'id username')
      .populate('reportedUser', 'id username')
      .populate('post', 'id media caption')
      .lean();

    // Formatting media thumbnail
    const formattedReports = reports.map((rep) => {
      let mediaThumbnail = null;
      if (rep.post && rep.post.media && rep.post.media[0]) {
        mediaThumbnail = rep.post.media[0].url;
      }
      return {
        id: rep._id.toString(),
        reporterId: rep.reporter ? rep.reporter._id.toString() : null,
        reporter: rep.reporter ? {
          id: rep.reporter._id.toString(),
          username: rep.reporter.username
        } : null,
        reportedUserId: rep.reportedUser ? rep.reportedUser._id.toString() : null,
        reportedUser: rep.reportedUser ? {
          id: rep.reportedUser._id.toString(),
          username: rep.reportedUser.username
        } : null,
        postId: rep.post ? rep.post._id.toString() : null,
        post: rep.post ? {
          id: rep.post._id.toString(),
          caption: rep.post.caption,
          media: rep.post.media
        } : null,
        reason: rep.reason,
        status: rep.status,
        createdAt: rep.createdAt,
        mediaThumbnail,
      };
    });

    return res.json({ reports: formattedReports });
  } catch (err) {
    console.error('Admin reports load error:', err);
    return res.status(500).json({ error: 'Failed to load moderation reports' });
  }
};

exports.createReport = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { postId, reportedUserId, reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason for report is required' });
    }

    const reportObj = await Report.create({
      reporter: reporterId,
      post: postId || null,
      reportedUser: reportedUserId || null,
      reason,
      status: 'PENDING',
    });

    const report = await Report.findById(reportObj._id)
      .populate('reporter', 'id username')
      .populate('reportedUser', 'id username')
      .populate('post', 'id media caption')
      .lean();

    return res.status(201).json({
      message: 'Report submitted successfully. Moderation will review this.',
      report: {
        ...report,
        id: report._id.toString()
      },
    });
  } catch (err) {
    console.error('Create report error:', err);
    return res.status(500).json({ error: 'Failed to file content report' });
  }
};

exports.resolveReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action } = req.body; // 'KEEP' or 'DELETE'

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (action === 'DELETE' && report.post) {
      // Delete the flagged post
      await Post.deleteOne({ _id: report.post });
      
      report.status = 'RESOLVED_DELETED';
      await report.save();

      return res.json({ message: 'Report resolved. Post deleted.' });
    } else {
      // Mark as resolved without delete
      report.status = 'RESOLVED_NO_ACTION';
      await report.save();

      return res.json({ message: 'Report resolved. No action taken.' });
    }
  } catch (err) {
    console.error('Resolve report error:', err);
    return res.status(500).json({ error: 'Failed to resolve report' });
  }
};

exports.toggleUserBan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { ban, reason } = req.body; // ban: boolean, reason: string

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.username === 'admin') {
      return res.status(400).json({ error: 'Cannot ban the admin user' });
    }

    user.isBanned = ban;
    user.banReason = ban ? (reason || 'Community violation') : null;
    await user.save();

    return res.json({
      message: ban ? `User ${user.username} has been banned.` : `User ${user.username} has been reinstated.`,
      user: {
        id: user.id,
        username: user.username,
        isBanned: user.isBanned,
      },
    });
  } catch (err) {
    console.error('User ban toggle error:', err);
    return res.status(500).json({ error: 'Failed to execute action on user' });
  }
};
