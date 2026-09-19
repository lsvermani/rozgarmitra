const User = require('../models/User');

// GET /api/users/profile
async function getProfile(req, res, next) {
  try {
    res.json({ success: true, user: req.user });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/profile
async function updateProfile(req, res, next) {
  try {
    const allowedFields = [
      'name',
      'profilePhoto',
      'language',
      'businessName',
      'skills',
      'categories',
      'experienceYears',
      'availability',
      'location',
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, message: 'Profile updated.', user });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/:id  (public profile view - e.g. job creator viewing a worker)
async function getUserById(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select(
      'name role businessName profilePhoto skills categories experienceYears availability rating ratingCount totalJobs completedJobs verified location.city location.state'
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, updateProfile, getUserById };
