const mongoose = require('mongoose');

const PostMediaSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['IMAGE', 'VIDEO'],
    default: 'IMAGE',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

PostMediaSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

PostMediaSchema.set('toJSON', {
  virtuals: true,
});

const PostSchema = new mongoose.Schema(
  {
    caption: {
      type: String,
      default: '',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    media: [PostMediaSchema],
  },
  {
    timestamps: true,
  }
);

PostSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// For compatibility with prisma userId reference
PostSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

PostSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Post', PostSchema);
