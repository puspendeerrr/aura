const mongoose = require('mongoose');

const BlockSchema = new mongoose.Schema(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    blocked: {
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

BlockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

BlockSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

BlockSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Block', BlockSchema);
