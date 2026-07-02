const mongoose = require('mongoose');

const HashtagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    posts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

HashtagSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

HashtagSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Hashtag', HashtagSchema);
