const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    reason: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'RESOLVED_NO_ACTION', 'RESOLVED_DELETED'],
      default: 'PENDING',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
);

ReportSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

ReportSchema.virtual('reporterId').get(function () {
  return this.reporter ? this.reporter.toString() : null;
});

ReportSchema.virtual('reportedUserId').get(function () {
  return this.reportedUser ? this.reportedUser.toString() : null;
});

ReportSchema.virtual('postId').get(function () {
  return this.post ? this.post.toString() : null;
});

ReportSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model('Report', ReportSchema);
