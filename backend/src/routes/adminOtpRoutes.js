/**
 * Admin Panel OTP login routes.
 *
 * Rate limiting is layered, because each layer answers a different question:
 *
 *   1. `requestLimiter`  - per IP, per window. Stops a broad spray of requests
 *                          across many source addresses.
 *   2. `verifyLimiter`   - per IP, per window. Stops code-guessing from one host.
 *   3. Cooldown + per-phone hourly cap - enforced in the controller against the
 *                          database, so they survive a restart and are keyed to
 *                          the *number* rather than the address.
 *
 * Using the project's existing `express-rate-limit` (already a dependency, already
 * applied globally in app.js) rather than adding Redis or another store: there is
 * no persistent cache in this deployment, and the durable part of the limit
 * lives in MongoDB where it cannot be flushed by a process restart.
 */
const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const validate = require('../middleware/validate');
const { requestOtp, verifyOtp } = require('../controllers/adminOtpController');
const otp = require('../services/adminOtpService');
const config = require('../config/adminOtp');

const router = express.Router();

/** Per-IP request ceiling for one hour. Defaults to 20. */
function perIpLimiter(maxPerHour) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: maxPerHour,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many OTP requests. Please try again later.',
    },
  });
}

/** Per-IP verification ceiling for 15 minutes. Defaults to 20. */
function verifyLimiter(maxAttempts) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: maxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many attempts. Please request a new OTP.',
    },
  });
}

/**
 * Both limits come from `config/adminOtp`, so an operator tunes them in one
 * place (.env) rather than in code.
 *
 * The limiters are built **once, at module load**, not inside a handler.
 * express-rate-limit requires this: an instance created per request would build
 * a fresh, empty counter store every time and therefore never actually limit
 * anything. `server.js` calls `dotenv.config()` before requiring `app.js`, so
 * the environment is already populated at this point - a changed .env value
 * simply needs a restart, which is how every other limit in this app behaves.
 */
const requestLimiter = perIpLimiter(config.getConfig().perIpHourlyLimit);
const verifyRateLimiter = verifyLimiter(config.getConfig().perIpVerifyAttempts);

/**
 * POST /api/auth/request-otp
 * body: { phone }
 *
 * Accepts `phone` or `mobile` and folds both onto `req.body.phone`, which is
 * the field the controller reads. Same normalisation trick as the existing
 * `acceptPhone` helper in authRoutes.js, so a client written against either
 * spelling works.
 */
function acceptPhone(req, res, next) {
  const raw = req.body.phone ?? req.body.mobile;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }
  req.body.phone = String(raw).trim();
  next();
}

router.post(
  '/request-otp',
  requestLimiter,
  [
    acceptPhone,
    body('phone').isString().isLength({ min: 10, max: 20 }),
    validate,
  ],
  requestOtp,
);

/**
 * True when this request should be handled by the admin OTP flow.
 *
 * The allow-listed administrator number is handled here and ONLY here. Every
 * other number must fall through to the pre-existing `/api/auth/verify-otp` in
 * authRoutes.js, which serves workers and job creators.
 *
 * `next('router')` exits *this* router and resumes in the parent, which is where
 * authRoutes is mounted (app.js mounts adminOtpRoutes first). `next()` continues
 * inside this router, reaching the admin validator and controller below.
 *
 * The check runs before the validators so a worker request is never rejected by
 * admin-only shape rules (such as "exactly 6 digits") on its way past.
 */
function onlyForAdminNumber(req, res, next) {
  const raw = req.body.phone ?? req.body.mobile;
  const national = config.toNational(raw);

  if (!national || !otp.isAuthorised(national)) return next('router'); // -> legacy worker/creator handler
  return next();                                                     // -> admin OTP handler
}

/** POST /api/auth/verify-otp — body: { phone, otp } — admin only, else falls through. */
router.post(
  '/verify-otp',
  onlyForAdminNumber,
  verifyRateLimiter,
  [
    acceptPhone,
    body('phone').isString().isLength({ min: 10, max: 20 }),
    body('otp').isString().matches(/^[0-9]{6}$/).withMessage('Enter the 6-digit OTP.'),
    validate,
  ],
  verifyOtp,
);

module.exports = router;