const mongoose = require('mongoose');

const RoomParticipantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    enum: ['MEMBER', 'ADMIN'],
    default: 'MEMBER',
  },
  isPinned: {
    type: Boolean,
    default: false,
  },
  isArchived: {
    type: Boolean,
    default: false,
  },
  isMuted: {
    type: Boolean,
    default: false,
  },
  lastReadAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

RoomParticipantSchema.virtual('userId').get(function () {
  return this.user ? this.user.toString() : null;
});

RoomParticipantSchema.set('toJSON', {
  virtuals: true,
});

const RoomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: null,
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    participants: [RoomParticipantSchema],
  },
  {
    timestamps: true,
  }
);

RoomSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

RoomSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Room', RoomSchema);
