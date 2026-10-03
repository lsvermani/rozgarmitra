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

    // --- Work Assignment module additions (§8). Optional/defaulted, so the
    // --- single existing selection document is unaffected. ---

    // 'low' | 'normal' | 'high' | 'urgent'
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    // When the assigned work is due. Drives the "overdue" report.
    deadline: { type: Date, default: null },
    // 0-100 completion tracking.
    progress: { type: Number, default: 0, min: 0, max: 100 },
    instructions: { type: String, default: '', maxlength: 2000 },
    // Denormalised so the assignment table can sort/filter by creator without
    // an extra join; kept in sync by the assignment controller.
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set when the assignment is cancelled or completed.
    completedAt: { type: Date, default: null },
    notes: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: true }
);

workerSelectionSchema.index({ jobId: 1, workerId: 1 }, { unique: true });
// Added for the admin Assigned Work module.
workerSelectionSchema.index({ status: 1, deadline: 1 });
workerSelectionSchema.index({ workerId: 1, createdAt: -1 });
workerSelectionSchema.index({ priority: 1, createdAt: -1 });

module.exports = mongoose.model('WorkerSelection', workerSelectionSchema);
