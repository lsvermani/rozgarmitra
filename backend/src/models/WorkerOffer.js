const mongoose = require('mongoose');

const workerOfferSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    proposedAmount: { type: Number, required: true, min: 0 },
    message: { type: String, default: '', trim: true },
    availabilityConfirmation: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
      default: 'PENDING',
    },
  },
  { timestamps: true }
);

// One active offer per worker per job
workerOfferSchema.index({ jobId: 1, workerId: 1, status: 1 });

module.exports = mongoose.model('WorkerOffer', workerOfferSchema);
