const mongoose = require('mongoose');

const MentionSchema = new mongoose.Schema(
  {
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
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

MentionSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

MentionSchema.virtual('postId').get(function () {
  return this.post ? this.post.toString() : null;
});

MentionSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

MentionSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Mention', MentionSchema);
