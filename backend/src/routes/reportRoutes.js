const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
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

router.post('/block/:userId', protect, blockUser);

module.exports = router;
