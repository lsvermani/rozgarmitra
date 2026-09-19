const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
  },
  { timestamps: true }
);

ratingSchema.index({ jobId: 1, fromUserId: 1, toUserId: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);
