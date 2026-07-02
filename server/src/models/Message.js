const mongoose = require('mongoose');

const MessageMediaSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['IMAGE', 'VIDEO', 'VOICE', 'FILE'],
    required: true,
  },
  name: {
    type: String,
    default: null,
  },
  size: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

MessageMediaSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

MessageMediaSchema.set('toJSON', {
  virtuals: true,
});

const MessageReactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  reaction: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

MessageReactionSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

MessageReactionSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

MessageReactionSchema.set('toJSON', {
  virtuals: true,
});

const MessageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      default: null,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['SENT', 'READ'],
      default: 'SENT',
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isForwarded: {
      type: Boolean,
      default: false,
    },
    isDeletedForEveryone: {
      type: Boolean,
      default: false,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isViewOnce: {
      type: Boolean,
      default: false,
    },
    selfDestructTimer: {
      type: Number,
      default: null,
    },
    screenshotDetected: {
      type: Boolean,
      default: false,
    },
    media: [MessageMediaSchema],
    deletions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    reactions: [MessageReactionSchema],
  },
  {
    timestamps: true,
  }
);

MessageSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

MessageSchema.virtual('roomId').get(function () {
  return this.room ? this.room.toString() : null;
});

MessageSchema.virtual('senderId').get(function () {
  return this.sender ? this.sender.toString() : null;
});

MessageSchema.virtual('replyToId').get(function () {
  return this.replyTo ? this.replyTo.toString() : null;
});

MessageSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Message', MessageSchema);
