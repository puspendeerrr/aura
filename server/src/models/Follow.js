const mongoose = require('mongoose');

const FollowSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['ACCEPTED', 'PENDING'],
      default: 'ACCEPTED',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

// Unique index to prevent duplicate follows
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });

FollowSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

FollowSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Follow', FollowSchema);
