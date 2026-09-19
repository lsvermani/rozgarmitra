const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    reason: {
      type: String,
      enum: ['Fraud', 'Wrong information', 'Payment issue', 'Harassment', 'Fake job', 'Other'],
      required: true,
    },
    description: { type: String, default: '' },
    status: { type: String, enum: ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'], default: 'OPEN' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
