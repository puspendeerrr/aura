const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

LikeSchema.index({ user: 1, post: 1 }, { unique: true });

LikeSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

LikeSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

LikeSchema.virtual('postId').get(function () {
  return this.post ? this.post.toString() : null;
});

LikeSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Like', LikeSchema);
