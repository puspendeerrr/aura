const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

StorySchema.virtual('id').get(function () {
  return this._id.toHexString();
});

StorySchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

StorySchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Story', StorySchema);
