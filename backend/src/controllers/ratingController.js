const Rating = require('../models/Rating');
const User = require('../models/User');
const Job = require('../models/Job');
const { notify } = require('../services/notificationService');

// POST /api/ratings
// body: { jobId, toUserId, rating, comment }
async function createRating(req, res, next) {
  try {
    const { jobId, toUserId, rating, comment } = req.body;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.status !== 'COMPLETED' && job.status !== 'RATED') {
      return res.status(400).json({ success: false, message: 'You can only rate after the job is completed.' });
    }

    const existing = await Rating.findOne({ jobId, fromUserId: req.user._id, toUserId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already rated this user for this job.' });
    }

    const newRating = await Rating.create({
      jobId,
      fromUserId: req.user._id,
      toUserId,
      rating,
      comment,
    });

    // Recalculate target user's average rating
    const toUser = await User.findById(toUserId);
    const newCount = toUser.ratingCount + 1;
    const newAvg = (toUser.rating * toUser.ratingCount + rating) / newCount;
    toUser.rating = Math.round(newAvg * 10) / 10;
    toUser.ratingCount = newCount;
    await toUser.save();

    await notify(toUserId, 'New rating received', `You received a ${rating}-star rating.`, 'RATING_RECEIVED', jobId);

    res.status(201).json({ success: true, message: 'Rating submitted.', rating: newRating });
  } catch (err) {
    next(err);
  }
}

// GET /api/ratings/:userId
async function getRatingsForUser(req, res, next) {
  try {
    const ratings = await Rating.find({ toUserId: req.params.userId })
      .populate('fromUserId', 'name profilePhoto')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: ratings.length, ratings });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRating, getRatingsForUser };
