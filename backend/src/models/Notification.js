const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'NEW_JOB_NEARBY',
        'APPLICATION_SHORTLISTED',
        'APPLICATION_SELECTED',
        'APPLICATION_REJECTED',
        'JOB_REMINDER',
        'NEW_APPLICATION',
        'JOB_COMPLETED',
        'RATING_RECEIVED',
        'GENERAL',
      ],
      default: 'GENERAL',
    },
    relatedJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
