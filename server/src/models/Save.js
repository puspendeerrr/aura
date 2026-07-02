const mongoose = require('mongoose');

const SaveSchema = new mongoose.Schema(
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

SaveSchema.index({ user: 1, post: 1 }, { unique: true });

SaveSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

SaveSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

SaveSchema.virtual('postId').get(function () {
  return this.post ? this.post.toString() : null;
});

SaveSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Save', SaveSchema);
