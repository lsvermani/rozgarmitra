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
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },

    status: {
      type: String,
      enum: ['POSTED', 'APPLICATIONS_RECEIVED', 'WORKER_SELECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RATED'],
      default: 'POSTED',
    },

    applicationsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
jobSchema.index({ date: 1 });

module.exports = mongoose.model('Job', jobSchema);
