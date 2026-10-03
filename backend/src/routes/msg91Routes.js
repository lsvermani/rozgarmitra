const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const msg91 = require('../services/msg91Service');
const msg91Config = require('../config/msg91');
const { widgetConfig, complete, status, diagnose } = require('../controllers/msg91Controller');

const router = express.Router();

/**
 * MSG91 OTP Widget routes, mounted by app.js under `/api/auth/msg91`.
 *
 * `complete` is rate limited tightly: it is the endpoint that would be abused if
 * MSG91's verification were ever bypassed, so the limiter is a second line of
 * defence behind the server-side token check itself.
 */
const windowMinutes = parseInt(process.env.MSG91_RATE_WINDOW_MINUTES || '15', 10);
const maxAttempts = parseInt(process.env.MSG91_RATE_MAX_REQUESTS || '20', 10);

const limiter = rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  max: maxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Please try again later.' },
});

router.get('/status', status);

/**
 * Serves the widget credentials to the browser.
 *
 * Not secret-gated: the MSG91 widget cannot initialise without them, and they
 * grant no privileged access on their own - a session is only ever issued by
 * `/complete` after MSG91 confirms the token. The route is feature-gated instead,
 * so a disabled or unconfigured MSG91 returns no credentials at all.
 */
router.get('/widget-config', widgetConfig);

router.post('/complete', limiter, [
  body('accessToken').isString().isLength({ min: 16, max: 4000 })
    .withMessage('Verification token is required.'),
  body('role').optional().isIn(['worker', 'job_creator']),
  body('name').optional().trim().isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters.'),
  validate,
], complete);

/** Admin view of the MSG91 configuration (masked). */
router.get('/admin/config',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  (req, res) => res.json({ success: true, config: msg91Config.toSafeSummary() }));

/**
 * Admin-only diagnostic: asks MSG91 whether the configured credentials are
 * accepted. Makes no billable call. Answers "why isn't OTP working" in one shot
 * instead of leaving it to guesswork.
 */
router.get('/admin/diagnose',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  diagnose);

module.exports = router;