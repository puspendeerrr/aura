const prisma = require('../config/db');

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        // We don't join posts fully, but fetch its media to show in notifications (like Instagram shows thumbnail of liked post)
        // Note: SQLite supports simple relations
      },
    });

    // To make thumbnails work, let's fetch thumbnail paths
    const formattedNotifications = [];
    for (const notif of notifications) {
      let postThumbnail = null;
      if (notif.postId) {
        const post = await prisma.post.findUnique({
          where: { id: notif.postId },
          select: { media: true },
        });
        if (post) {
          postThumbnail = post.media.split(',')[0]; // First media URL/path
        }
      }

      formattedNotifications.push({
        ...notif,
        postThumbnail,
      });
    }

    return res.json({ notifications: formattedNotifications });
  } catch (err) {
    console.error('Get notifications error:', err);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.notification.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark notifications read error:', err);
    return res.status(500).json({ error: 'Failed to update notifications' });
  }
};
