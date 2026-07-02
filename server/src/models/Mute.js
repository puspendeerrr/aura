const mongoose = require('mongoose');

const MuteSchema = new mongoose.Schema(
  {
    muter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    muted: {
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

MuteSchema.index({ muter: 1, muted: 1 }, { unique: true });

MuteSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

MuteSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Mute', MuteSchema);
