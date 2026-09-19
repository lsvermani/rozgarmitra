const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'],
    },
    role: {
      type: String,
      enum: ['worker', 'job_creator', 'admin'],
      required: true,
    },
    businessName: { type: String, default: '' }, // for job_creator
    profilePhoto: { type: String, default: '' },
    language: { type: String, enum: ['en', 'hi', 'pa'], default: 'en' },

    // Worker-specific
    skills: [{ type: String }],
    categories: [{ type: String }],
    experienceYears: { type: Number, default: 0 },
    availability: {
      type: [String], // e.g. ['Mon','Tue','Wed']
      default: [],
    },

    location: { type: locationSchema, default: () => ({}) },

    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalJobs: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },

    verified: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },

    // OTP fields (mock/dev auth)
    otpCode: { type: String, select: false },
    otpExpiresAt: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
