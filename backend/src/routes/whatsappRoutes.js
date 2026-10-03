const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  sendOtp, verifyOtp, resendOtp, status,
  getConfig, testConnection, stats, failures,
} = require('../controllers/whatsappAuthController');

const router = express.Router();

/**
 * Public WhatsApp OTP routes.
 *
 * Mounted by app.js under `/api/auth/whatsapp`, which keeps them beside the
 * existing `/api/auth/*` endpoints rather than creating a parallel auth tree.
 *
 * The whole router sits behind a dedicated limiter that is much tighter than the
 * global one. OTP endpoints are the most attractive thing to abuse on any
 * service - each request costs money and can be used to harass a handset - so
 * the limit is enforced on the server and cannot be bypassed by a client simply
 * not rendering a countdown.
 */
const publicWindowMinutes = parseInt(process.env.WHATSAPP_RATE_WINDOW_MINUTES || '15', 10);
const publicMax = parseInt(process.env.WHATSAPP_RATE_MAX_REQUESTS || '30', 10);

const otpLimiter = rateLimit({
  windowMs: publicWindowMinutes * 60 * 1000,
  max: publicMax,
  standardHeaders: true,
  legacyHeaders: false,
  // Keyed on the caller's address; a per-phone limit is applied separately in
  // the controller, against the database, so it survives a restart.
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again later.',
  },
});

/** Purpose is constrained so an arbitrary string can never reach the query. */
const purposeRule = body('purpose')
  .optional()
  .isIn(['registration', 'login'])
  .withMessage('Purpose must be "registration" or "login".');

router.get('/status', status);

router.post('/send-otp', otpLimiter, [
  body('phone').optional().isString().isLength({ min: 6, max: 20 }),
  body('mobile').optional().isString().isLength({ min: 6, max: 20 }),
  body('role').optional().isIn(['worker', 'job_creator']),
  purposeRule,
  // One of the two must be present; the controller normalises either.
  (req, res, next) => {
    if (!req.body.phone && !req.body.mobile) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    next();
  },
  validate,
], sendOtp);

router.post('/resend-otp', otpLimiter, [
  body('phone').optional().isString().isLength({ min: 6, max: 20 }),
  body('mobile').optional().isString().isLength({ min: 6, max: 20 }),
  body('role').optional().isIn(['worker', 'job_creator']),
  purposeRule,
  (req, res, next) => {
    if (!req.body.phone && !req.body.mobile) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    next();
  },
  validate,
], resendOtp);

router.post('/verify-otp', otpLimiter, [
  body('phone').optional().isString().isLength({ min: 6, max: 20 }),
  body('mobile').optional().isString().isLength({ min: 6, max: 20 }),
  body('otp').isString().matches(/^\d{4,8}$/).withMessage('Enter a valid OTP.'),
  body('role').optional().isIn(['worker', 'job_creator']),
  body('name').optional().trim().isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters.'),
  purposeRule,
  (req, res, next) => {
    if (!req.body.phone && !req.body.mobile) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    next();
  },
  validate,
], verifyOtp);

// ---------------------------------------------------------------------------
// Admin surface.
//
// `protect` populates req.user; `requirePermission` then checks RBAC. A worker
// or job creator holds none of these permissions, so they are refused with 403
// before any handler runs. Mutating routes additionally require
// `settings.configure`, which only admin/super_admin hold.
// ---------------------------------------------------------------------------

router.get('/admin/config',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  getConfig);

router.post('/admin/test-connection',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  testConnection);

router.get('/admin/stats',
  protect,
  requirePermission(PERMISSIONS.LOGS_VIEW),
  stats);

router.get('/admin/failures',
  protect,
  requirePermission(PERMISSIONS.LOGS_VIEW),
  failures);

module.exports = router;