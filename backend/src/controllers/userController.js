const User = require('../models/User');
const audit = require('../services/auditService');
const { redactDeep } = require('../utils/redact');

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

    // An administrative account's name is an operator-level decision and must
    // not be changeable from a self-service profile call. This endpoint takes
    // whatever `name` it is handed for `req.user` with no guard and no audit,
    // which meant signing in through a worker/creator screen with a leftover
    // pending name could silently repoint the Super Admin account's display
    // name. Admins are renamed through PUT /api/admin/users/:id instead, which
    // is permission-checked and written to the audit trail.
    if (updates.name !== undefined && req.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'An administrator name can only be changed from the admin panel.',
      });
    }

    const before = updates.name !== undefined ? { name: req.user.name } : null;

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    // Profile edits were previously invisible in the audit trail, which is how a
    // renamed admin account went unnoticed.
    audit.record({
      req,
      user,
      action: 'user.profile_updated',
      module: 'users',
      before,
      after: redactDeep(updates),
      message: 'Profile updated.',
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
      'name role businessName profilePhoto skills categories experienceYears availability rating ratingCount totalJobs completedJobs verified location.locality location.city location.state'
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, updateProfile, getUserById };
