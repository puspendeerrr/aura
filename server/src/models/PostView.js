const mongoose = require('mongoose');

const PostViewSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    watchTime: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

PostViewSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

PostViewSchema.virtual('postId').get(function () {
  return this.post ? this.post.toString() : null;
});

PostViewSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

PostViewSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('PostView', PostViewSchema);
