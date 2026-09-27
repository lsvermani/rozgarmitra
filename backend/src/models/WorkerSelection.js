const mongoose = require('mongoose');

const workerSelectionSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerOffer', required: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    selectedAmount: { type: Number, required: true },
    selectedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['SELECTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'],
      default: 'SELECTED',
    },
  },
  { timestamps: true }
);

workerSelectionSchema.index({ jobId: 1, workerId: 1 }, { unique: true });

module.exports = mongoose.model('WorkerSelection', workerSelectionSchema);
