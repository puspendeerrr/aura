const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  {
    timestamps: true,
  }
);

CommentSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

CommentSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

CommentSchema.virtual('postId').get(function () {
  return this.post ? this.post.toString() : null;
});

CommentSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Comment', CommentSchema);
