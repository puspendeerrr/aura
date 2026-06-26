const prisma = require('../config/db');

exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalPosts = await prisma.post.count();
    const totalComments = await prisma.comment.count();
    const totalReports = await prisma.report.count({
      where: { status: 'PENDING' }
    });

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
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        name: true,
        isPrivate: true,
        isBanned: true,
        banReason: true,
        createdAt: true,
      },
    });

    return res.json({ users });
  } catch (err) {
    console.error('Admin user list error:', err);
    return res.status(500).json({ error: 'Failed to load user list' });
  }
};

exports.getReports = async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: {
          select: { id: true, username: true },
        },
        reportedUser: {
          select: { id: true, username: true },
        },
        post: {
          select: { id: true, media: true, caption: true },
        },
      },
    });

    // Formatting media thumbnail
    const formattedReports = reports.map((rep) => {
      let mediaThumbnail = null;
      if (rep.post && rep.post.media) {
        mediaThumbnail = rep.post.media.split(',')[0];
      }
      return {
        ...rep,
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

    const report = await prisma.report.create({
      data: {
        reporterId,
        postId,
        reportedUserId,
        reason,
        status: 'PENDING',
      },
    });

    return res.status(201).json({
      message: 'Report submitted successfully. Moderation will review this.',
      report,
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

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { post: true },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (action === 'DELETE' && report.postId) {
      // Delete the flagged post
      await prisma.post.delete({
        where: { id: report.postId },
      });
      
      await prisma.report.update({
        where: { id: reportId },
        data: { status: 'RESOLVED_DELETED' },
      });

      return res.json({ message: 'Report resolved. Post deleted.' });
    } else {
      // Mark as resolved without delete
      await prisma.report.update({
        where: { id: reportId },
        data: { status: 'RESOLVED_NO_ACTION' },
      });

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

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.username === 'admin') {
      return res.status(400).json({ error: 'Cannot ban the admin user' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: ban,
        banReason: ban ? (reason || 'Community violation') : null,
      },
    });

    return res.json({
      message: ban ? `User ${user.username} has been banned.` : `User ${user.username} has been reinstated.`,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        isBanned: updatedUser.isBanned,
      },
    });
  } catch (err) {
    console.error('User ban toggle error:', err);
    return res.status(500).json({ error: 'Failed to execute action on user' });
  }
};
