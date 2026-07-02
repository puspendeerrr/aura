const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['LIKE', 'COMMENT', 'FOLLOW', 'FOLLOW_REQUEST', 'MESSAGE', 'MENTION'],
      required: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

NotificationSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

NotificationSchema.virtual('recipientId').get(function () {
  return this.recipient ? this.recipient.toString() : null;
});

NotificationSchema.virtual('senderId').get(function () {
  return this.sender ? this.sender.toString() : null;
});

NotificationSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Notification', NotificationSchema);
