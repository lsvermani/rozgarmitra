const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { createRating, getRatingsForUser } = require('../controllers/ratingController');

const router = express.Router();

router.post(
  '/',
  protect,
  [
    body('jobId').notEmpty(),
    body('toUserId').notEmpty(),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5.'),
  ],
  validate,
  createRating
);

// GET /api/ratings/:userId
//
// SECURITY: this route previously had no `protect` middleware, which let any
// anonymous visitor enumerate the reputation, comment and profile photo of any
// user by iterating ids. It now requires a signed-in session like the rest of
// the user-scoped reads.
//
// The ratings shown on job/worker cards are NOT affected: those are populated
// server-side by the offers and applications controllers, not by this endpoint,
// so the website and the Android app are unaffected.
router.get('/:userId', protect, getRatingsForUser);

module.exports = router;
