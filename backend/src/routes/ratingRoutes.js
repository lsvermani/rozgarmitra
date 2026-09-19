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

router.get('/:userId', getRatingsForUser);

module.exports = router;
