const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const {
  createJob,
  listJobs,
  getJob,
  updateJob,
  deleteJob,
  applyToJob,
  completeJob,
} = require('../controllers/jobController');

const router = express.Router();

// Public listing (works without auth so unauthenticated browsing/demo is possible),
// but attach user if token provided so myApplication can be resolved.
const { verifyToken } = require('../utils/token');
const User = require('../models/User');
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
  if (!token) return next();
  try {
    const decoded = verifyToken(token);
    req.user = await User.findById(decoded.id);
  } catch (e) {
    // ignore invalid token for optional auth
  }
  next();
}

router.get('/', optionalAuth, listJobs);
router.get('/:id', optionalAuth, getJob);

router.post(
  '/',
  protect,
  authorize('job_creator'),
  [
    body('title').notEmpty().withMessage('Job title is required.'),
    body('category').notEmpty().withMessage('Category is required.'),
    body('workersRequired').isInt({ min: 1 }).withMessage('Workers required must be at least 1.'),
    body('date').notEmpty().withMessage('Date is required.'),
    body('startTime').notEmpty().withMessage('Start time is required.'),
    body('endTime').notEmpty().withMessage('End time is required.'),
    body('payment').isFloat({ min: 0 }).withMessage('Payment must be a positive number.'),
    body('location').notEmpty().withMessage('Location is required.'),
  ],
  validate,
  createJob
);

router.put('/:id', protect, authorize('job_creator'), updateJob);
router.delete('/:id', protect, authorize('job_creator'), deleteJob);
router.post('/:id/apply', protect, authorize('worker'), applyToJob);
router.post('/:id/complete', protect, authorize('job_creator'), completeJob);

module.exports = router;
