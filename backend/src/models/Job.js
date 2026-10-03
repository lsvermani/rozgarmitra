const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, required: true },
    requiredSkills: [{ type: String }],
    workersRequired: { type: Number, required: true, min: 1, default: 1 },
    workersSelected: { type: Number, default: 0 },

    date: { type: Date, required: true },
    startTime: { type: String, required: true }, // "09:00"
    endTime: { type: String, required: true }, // "17:00"
    duration: { type: String, default: '1 Day' },

    payment: { type: Number, required: true, min: 0 },
    paymentUnit: { type: String, enum: ['day', 'hour', 'task'], default: 'day' },

    location: {
      address: { type: String, default: '' },
      locality: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },

    status: {
      type: String,
      enum: [
        // --- existing values: the website and the Flutter app compare these
        // --- exact strings, so they are kept as-is (see config/permissions.js
        // --- JOB_STATUS_MAP for the Draft/Pending/Assigned aliases).
        'OPEN',
        'OFFERS_RECEIVED',
        'WORKERS_SELECTED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'POSTED', // <- Draft
        'APPLICATIONS_RECEIVED', // <- Pending
        'WORKER_SELECTED', // <- Assigned
        'RATED',
        // --- genuinely new, added for the admin Job Management module.
        'UNDER_REVIEW',
        'REJECTED',
      ],
      default: 'OPEN',
    },

    // --- Admin Job Management additions (§7). All optional with defaults, so
    // --- the 21 existing job documents are untouched by this change. ---

    // 'low' | 'normal' | 'high' | 'urgent'
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    // Optional completion deadline, distinct from `date` (the work day).
    deadline: { type: Date, default: null },
    // Free-text instructions shown to the assigned worker.
    instructions: { type: String, default: '', maxlength: 4000 },
    // 0-100, maintained by the admin and reflected on the dashboard.
    progress: { type: Number, default: 0, min: 0, max: 100 },
    // Set when status becomes REJECTED.
    rejectionReason: { type: String, default: '', maxlength: 500 },

    offersCount: { type: Number, default: 0 },
    applicationsCount: { type: Number, default: 0 },
    photos: [{ type: String }],
  },
  { timestamps: true }
);

jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
jobSchema.index({ date: 1 });
// Added for the admin listings, which filter and sort on these.
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ priority: 1, deadline: 1 });
jobSchema.index({ creatorId: 1, createdAt: -1 });

module.exports = mongoose.model('Job', jobSchema);
