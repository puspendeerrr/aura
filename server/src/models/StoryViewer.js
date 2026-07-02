const mongoose = require('mongoose');

const StoryViewerSchema = new mongoose.Schema(
  {
    story: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Story',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  }
);

StoryViewerSchema.index({ story: 1, user: 1 }, { unique: true });

StoryViewerSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

StoryViewerSchema.virtual('storyId').get(function () {
  return this.story ? this.story.toString() : null;
});

StoryViewerSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

StoryViewerSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('StoryViewer', StoryViewerSchema);
