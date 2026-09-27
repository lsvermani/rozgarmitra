const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { sendOtp, verifyOtp, firebaseAuth } = require('../controllers/authController');

const router = express.Router();

router.post(
  '/send-otp',
  [
    body('mobile').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number.'),
    body('role').optional().isIn(['worker', 'job_creator']),
    body('name').optional().trim().isLength({ min: 2, max: 60 }).withMessage('Name must be between 2 and 60 characters.'),
  ],
  validate,
  sendOtp
);

router.post(
  '/verify-otp',
  [
    body('mobile').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number.'),
    body('otp').isLength({ min: 4, max: 6 }).withMessage('Enter a valid OTP.'),
    body('role').optional().isIn(['worker', 'job_creator', 'admin']),
    body('name').optional().trim().isLength({ min: 2, max: 60 }).withMessage('Name must be between 2 and 60 characters.'),
  ],
  validate,
  verifyOtp
);

router.post(
  '/firebase',
  [
    body('idToken').isString().notEmpty(),
    body('role').optional().isIn(['worker', 'job_creator']),
  ],
  validate,
  firebaseAuth
);

module.exports = router;
