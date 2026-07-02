const Notification = require('../models/Notification');
const Post = require('../models/Post');

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .populate('sender', 'id username avatar')
      .lean();

    // To make thumbnails work, let's fetch thumbnail paths
    const formattedNotifications = [];
    for (const notif of notifications) {
      let postThumbnail = null;
      if (notif.postId) {
        const post = await Post.findById(notif.postId).select('media').lean();
        if (post && post.media && post.media[0]) {
          postThumbnail = post.media[0].url; // First media URL
        }
      }

      formattedNotifications.push({
        id: notif._id.toString(),
        recipientId: notif.recipient ? notif.recipient.toString() : null,
        senderId: notif.sender ? notif.sender._id.toString() : null,
        sender: notif.sender ? {
          id: notif.sender._id.toString(),
          username: notif.sender.username,
          avatar: notif.sender.avatar,
        } : null,
        type: notif.type,
        postId: notif.postId ? notif.postId.toString() : null,
        roomId: notif.roomId ? notif.roomId.toString() : null,
        isRead: notif.isRead,
        createdAt: notif.createdAt,
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

    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark notifications read error:', err);
    return res.status(500).json({ error: 'Failed to update notifications' });
  }
};
