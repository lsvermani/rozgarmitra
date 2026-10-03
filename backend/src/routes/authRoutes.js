const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { sendOtp, verifyOtp, firebaseAuth, logout } = require('../controllers/authController');
const {
  adminLogin,
  changeAdminPassword,
  setInitialPassword,
  adminSession,
} = require('../controllers/adminAuthController');

const router = express.Router();

/**
 * Accepts the number as either `phone` or `mobile` and normalises it to
 * `req.body.mobile`, which is the field every downstream handler already reads.
 *
 * `phone` is the name the integration guide and the Android app use; `mobile` is
 * what this endpoint originally accepted. Supporting both means neither client
 * has to be rewritten, and the two spellings cannot drift apart because they are
 * folded together here rather than in each controller.
 */
function acceptPhone(req, res, next) {
  const raw = req.body.phone ?? req.body.mobile;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }
  req.body.mobile = String(raw).trim();
  next();
}

router.post(
  '/send-otp',
  [
    acceptPhone,
    body('mobile').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number.'),
    // 'admin' is accepted here purely so the controller can answer with a
    // deliberate 403 and a clear message. Without it, express-validator rejected
    // the request with a 400 "Invalid value" *before* the handler ran, so the
    // caller saw a validation error instead of being told the admin flow moved.
    body('role').optional().isIn(['worker', 'job_creator', 'admin']),
    body('purpose').optional().isIn(['registration', 'login']),
    body('name').optional().trim().isLength({ min: 2, max: 60 }).withMessage('Name must be between 2 and 60 characters.'),
  ],
  validate,
  sendOtp
);

router.post(
  '/verify-otp',
  [
    acceptPhone,
    body('mobile').matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number.'),
    body('otp').isLength({ min: 4, max: 6 }).withMessage('Enter a valid OTP.'),
    body('role').optional().isIn(['worker', 'job_creator', 'admin']),
    body('purpose').optional().isIn(['registration', 'login']),
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

// ---------------------------------------------------------------------------
// Admin password authentication (§24) — additive.
// The OTP flow above is unchanged, so every existing login keeps working.
// ---------------------------------------------------------------------------

// Tight limiter specifically for password login. This sits *in front of* the
// per-account lockout in adminAuthService: the limiter slows a broad spray
// across many accounts, the lockout stops a focused attack on one account.
//
// Limits are env-configurable so an operator can tune them per deployment
// without a code change, and so the automated acceptance test can raise them.
const loginWindowMinutes = parseInt(process.env.ADMIN_LOGIN_WINDOW_MINUTES || '15', 10);
const loginMaxAttempts = parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || '20', 10);

const adminLoginLimiter = rateLimit({
  windowMs: loginWindowMinutes * 60 * 1000,
  max: loginMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many sign-in attempts. Please try again later.' },
});

router.post(
  '/admin/login',
  adminLoginLimiter,
  [
    body('password').isString().notEmpty().withMessage('Password is required.'),
    body('email').optional().isString(),
    body('mobile').optional().isString(),
  ],
  validate,
  adminLogin
);

router.get('/admin/session', protect, adminSession);

router.post(
  '/admin/set-password',
  protect,
  [body('newPassword').isString().notEmpty().withMessage('New password is required.')],
  validate,
  setInitialPassword
);

router.post(
  '/admin/change-password',
  protect,
  adminLoginLimiter,
  [
    body('currentPassword').isString().notEmpty().withMessage('Current password is required.'),
    body('newPassword').isString().notEmpty().withMessage('New password is required.'),
  ],
  validate,
  changeAdminPassword
);

// Sign-out is recorded for the activity trail. `protect` is applied so a failed
// audit write is reported rather than swallowed, but the endpoint stays tolerant:
// the client clears its own token regardless.
router.post('/logout', protect, logout);

module.exports = router;
