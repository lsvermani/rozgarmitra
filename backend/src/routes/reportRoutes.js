const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const { createReport, blockUser } = require('../controllers/reportController');

const router = express.Router();

router.post(
  '/',
  protect,
  [
    body('reason')
      .isIn(['Fraud', 'Wrong information', 'Payment issue', 'Harassment', 'Fake job', 'Other'])
      .withMessage('Invalid report reason.'),
  ],
  validate,
  createReport
);

// POST /api/reports/block/:userId
//
// SECURITY: this route previously accepted *any* authenticated role, including
// `admin`. An administrator belongs to the moderation side of the platform — a
// moderator blocking somebody, or a moderator blocking themselves, is never a
// legitimate end-user action, and allowing it pollutes the reports queue with
// rows that an admin then has to triage manually.
//
// `authorize('worker', 'job_creator')` keeps the Android app's "block user"
// button working exactly as before while closing the moderation-side hole.
router.post('/block/:userId', protect, authorize('worker', 'job_creator'), blockUser);

module.exports = router;
