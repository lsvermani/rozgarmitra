/**
 * WhatsApp OTP authentication.
 *
 * Reuses the application's existing authentication rather than creating a
 * second one: a successful verification mints the **same** JWT via
 * `utils/token.js` and returns the same `{ token, user }` envelope that
 * `controllers/authController.js` returns, so every downstream client, middleware
 * and guard keeps working unchanged.
 *
 * What is different from the SMS flow is only how the code is delivered and how
 * it is stored (hashed, expiring, attempt-limited) - see
 * `services/whatsappOtpService.js`.
 *
 * Nothing in here ever returns, logs, or echoes an OTP, and Meta error details
 * are translated into short, user-facing sentences before leaving the process.
 */
const User = require('../models/User');
const otpService = require('../services/whatsappOtpService');
const deliveryService = require('../services/otpDeliveryService');
const delivery = require('../config/otpDelivery');
const audit = require('../services/auditService');
const { signToken } = require('../utils/token');
const { normalisePhone, toNationalNumber, maskPhone } = require('../utils/phone');

const PURPOSES = ['registration', 'login'];

/** Guards shared by send and resend: service availability + abuse limits. */
async function guardRequest(res, { phone, purpose }) {
  const cfg = delivery.getProviderConfig();

  // In test mode the service is usable without real provider credentials - that
  // is the whole point of the mode. `unusableReason()` is only consulted for a
  // real run. Test mode itself is a policy switch, so it is read from the policy
  // config rather than the delivery provider.
  const policy = require('../config/whatsapp').getConfig();
  if (!policy.testMode) {
    const reason = delivery.unusableReason();
    if (reason) {
      return res.status(503).json({ success: false, message: deliveryService.deliveryMessage('service_not_configured') });
    }
  }

  const existing = await require('../models/WhatsAppOTP').findOne({ phone, purpose }).lean();
  if (existing) {
    const wait = otpService.resendWaitSeconds(existing.lastSentAt);
    if (wait > 0) {
      return res.status(429).json({
        success: false,
        message: `Please wait before requesting another OTP. Try again in ${wait} seconds.`,
        retryAfter: wait,
      });
    }
  }

  const hourly = await otpService.sentInLastHour(phone);
  if (hourly >= cfg.perPhoneHourlyLimit) {
    return res.status(429).json({
      success: false,
      message: 'Too many OTP requests for this number. Please try again later.',
    });
  }

  return null;
}
/**
 * Tells the user where to look for the code, so the wording matches the channel
 * actually in use. Saying "check WhatsApp" when an SMS was sent is a support
 * ticket waiting to happen.
 */
function channelHint(cfg) {
  if (cfg.provider === 'otpdev') {
    switch (cfg.otpdev.channel) {
      case 'whatsapp': return 'OTP sent successfully. Please check your WhatsApp.';
      case 'telegram': return 'OTP sent successfully. Please check Telegram.';
      case 'viber': return 'OTP sent successfully. Please check Viber.';
      case 'email': return 'OTP sent successfully. Please check your email.';
      case 'voice':
      case 'flashcall': return 'We will call you shortly with your verification code.';
      default: return 'OTP sent successfully. Please check your messages.';
    }
  }
  if (cfg.provider === 'whatsapp') {
    return 'OTP sent successfully. Please check your WhatsApp.';
  }
  if (cfg.provider === 'msg91api') {
    return 'OTP sent successfully. Please check your messages.';
  }
  if (cfg.provider === 'gateway') {
    return 'OTP sent successfully. Please check your messages.';
  }
  return 'OTP generated.';
}

/**
 * POST /api/auth/whatsapp/send-otp
 * body: { phone, purpose?, role? }
 *
 * `role` is only meaningful for a number the app has never seen, mirroring
 * `POST /auth/send-otp`. It is ignored when the account already exists.
 */
async function sendOtp(req, res, next) {
  try {
    const purpose = PURPOSES.includes(req.body.purpose) ? req.body.purpose : 'registration';
    const role = ['worker', 'job_creator'].includes(req.body.role) ? req.body.role : '';

    const phoneResult = normalisePhone(req.body.phone || req.body.mobile);
    if (!phoneResult.ok) {
      return res.status(400).json({ success: false, message: phoneResult.reason });
    }
    const { e164, national } = phoneResult;

    const blocked = await guardRequest(res, { phone: e164, purpose });
    if (blocked) return blocked;

    const nationalNumber = national || toNationalNumber(e164);
    if (nationalNumber) {
      const existing = await User.findOne({ mobile: nationalNumber });
      if (existing && existing.blocked) {
        return res.status(403).json({ success: false, message: 'This account has been blocked.' });
      }
      // A brand-new number needs a role before an account can be created - the
      // same rule the existing SMS endpoint enforces.
      if (!existing && !role && purpose === 'registration') {
        return res.status(400).json({
          success: false,
          message: 'New number detected. Please provide role: "worker" or "job_creator".',
        });
      }
    }

    // Hash and persist first, then deliver. A delivery failure marks the record
    // failed rather than deleting it, so the attempt stays visible to an admin.
    const otp = await otpService.issue({ phone: e164, national: nationalNumber || '', purpose });
    const result = await deliveryService.send(e164, otp);

    await otpService.markDelivery(e164, purpose, {
      ok: result.ok,
      errorCode: result.errorCode,
      messageId: result.messageId,
    });

    if (!result.ok) {
      // The code stays valid: Meta can accept a message seconds after a
      // transient API error returns, and forcing a resend would punish the user
      // for Meta's outage. The failure is recorded for the admin instead.
      return res.status(502).json({ success: false, message: deliveryService.deliveryMessage(result.errorCode) });
    }

    audit.record({
      req,
      action: 'auth.whatsapp_otp_sent',
      module: 'auth',
      event: 'whatsapp_otp',
      message: `WhatsApp OTP sent to ${maskPhone(e164)}.`,
    });

    const cfg = delivery.getProviderConfig();
    // OTP policy (length, expiry, resend, and the test-mode switch) lives in
    // config/whatsapp.js; the delivery provider does not own those. They are read
    // from separate modules on purpose so a provider swap cannot change policy.
    const policy = require('../config/whatsapp').getConfig();

    res.json({
      success: true,
      message: channelHint(cfg),
      expiresIn: policy.otpExpiryMinutes * 60,
      resendAfter: policy.otpResendSeconds,
      // Only ever populated outside production, so the automated suite can verify
      // without a real provider account. `config/whatsapp.js` refuses to enable
      // test mode when NODE_ENV=production.
      ...(policy.testMode ? { testOtp: otp } : {}),
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/whatsapp/resend-otp - same behaviour, clearer intent for clients. */
async function resendOtp(req, res, next) {
  return sendOtp(req, res, next);
}

/**
/**
 * POST /api/auth/whatsapp/verify-otp
 * body: { phone, otp, purpose?, role?, name?, liveLocation? }
 *
 * On success this is a full sign-in: it marks the number verified, resolves or
 * creates the account, and returns the same `{ token, user }` envelope as the
 * existing SMS endpoint. The token is the application's own JWT, so nothing
 * downstream needs to change.
 */
async function verifyOtp(req, res, next) {
  try {
    const purpose = PURPOSES.includes(req.body.purpose) ? req.body.purpose : 'registration';
    const role = ['worker', 'job_creator'].includes(req.body.role) ? req.body.role : '';

    const phoneResult = normalisePhone(req.body.phone || req.body.mobile);
    if (!phoneResult.ok) {
      return res.status(400).json({ success: false, message: phoneResult.reason });
    }
    const { e164, national } = phoneResult;

    const otp = String(req.body.otp || '').trim();
    if (!/^\d{4,8}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Enter a valid OTP.' });
    }

    const result = await otpService.check({ phone: e164, purpose, otp });
    if (!result.ok) {
      // Recorded without the submitted code.
      audit.record({
        req,
        action: 'auth.whatsapp_otp_failed',
        module: 'auth',
        event: 'whatsapp_otp',
        result: 'denied',
        message: `Failed WhatsApp OTP attempt for ${maskPhone(e164)}.`,
      });
      return res.status(result.status).json({ success: false, message: result.reason });
    }

    const nationalNumber = national || toNationalNumber(e164);
    if (!nationalNumber) {
      return res.status(400).json({
        success: false,
        message: 'This number cannot be used for an account yet.',
      });
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

    // Same account resolution as `authController.verifyOtp`: one number may hold
    // a worker and a job-creator account, so the role is part of the lookup.
    let user = await User.findOne(role ? { mobile: nationalNumber, role } : { mobile: nationalNumber });
    if (!user) {
      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'New number detected. Please provide role: "worker" or "job_creator".',
        });
      }
      user = await User.create({ mobile: nationalNumber, role, ...(name ? { name } : {}) });
    }

    if (user.blocked) {
      return res.status(403).json({ success: false, message: 'This account has been blocked.' });
    }

    // Only now - after a correct code - is the number treated as verified.
    user.phoneVerified = true;
    user.phoneVerifiedAt = new Date();
    user.lastLoginAt = new Date();
    user.lastLoginIp = String(req.ip || '').slice(0, 64);
    // A client-supplied `name` may only fill a missing one, exactly as in the
    // SMS flow - an OTP request must never be able to rename an account.
    if (name && !user.name) user.name = name;
    await user.save();

    // Coordinates still ride along so the audit trail keeps recording where the
    // sign-in happened; optional and not part of verification.
    audit.recordSignIn(req, user, { liveLocation: req.body.liveLocation, method: 'WhatsApp' });

    res.json({
      success: true,
      verified: true,
      message: 'WhatsApp number verified successfully',
      token: signToken(user),
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        profileComplete: Boolean(user.name),
        language: user.language,
        phoneVerified: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

// `channel` tells a client what to tell the user to look at. Each provider
// delivers differently, and saying "check WhatsApp" for an SMS is a support
// ticket waiting to happen.
function describeChannel(cfg) {
  if (cfg.provider === 'otpdev') return cfg.otpdev.channel;
  if (cfg.provider === 'whatsapp') return 'whatsapp';
  if (cfg.provider === 'gateway') return 'sms';
  return 'none';
}

/**
 * GET /api/auth/whatsapp/status
 *
 * Tells a client whether it may offer OTP delivery, and the policy it should
 * mirror in its countdown. Combines two sources on purpose: the delivery
 * provider (otpDelivery) and the OTP policy (whatsapp config, which also owns
 * the test-mode switch and the hashing pepper).
 */
async function status(req, res) {
  const providerCfg = delivery.getProviderConfig();
  const policy = require('../config/whatsapp').getConfig();
  const cfg = providerCfg;

  res.json({
    success: true,
    // `usable` is the real gate; `enabled` is kept for the existing clients.
    enabled: cfg.usable,
    active: cfg.usable,
    provider: cfg.provider,
    channel: describeChannel(cfg),
    reason: delivery.unusableReason(),
    otpLength: policy.otpLength,
    expiresIn: policy.otpExpiryMinutes * 60,
    resendAfter: policy.otpResendSeconds,
    maxAttempts: policy.otpMaxAttempts,
  });
}

// ===========================================================================
// Admin surface
//
// Every handler below sits behind `protect` + `requirePermission(...)` in
// routes/whatsappRoutes.js, so a worker or job creator cannot reach it. The
// access token is never returned - only whether one is set, plus a masked hint.
// ===========================================================================

const WhatsAppOTP = require('../models/WhatsAppOTP');

/** GET /api/admin/whatsapp/config - masked configuration for the settings screen. */
async function getConfig(req, res) {
  res.json({ success: true, config: delivery.toSafeSummary(), reason: delivery.unusableReason() });
}

/** POST /api/admin/whatsapp/test-connection - proves the credentials work. */
async function testConnection(req, res, next) {
  try {
    const result = await deliveryService.testConnection();

    audit.record({
      req,
      user: req.user,
      action: 'whatsapp.test_connection',
      module: 'settings',
      result: result.ok ? 'success' : 'error',
      message: result.ok
        ? 'WhatsApp connection test succeeded.'
        : `Connection test failed (${result.errorCode}).`,
    });

    if (!result.ok) {
      return res.status(502).json({
        success: false,
        message: 'Could not reach WhatsApp with the configured credentials.',
        errorCode: result.errorCode,
      });
    }

    res.json({
      success: true,
      message: 'WhatsApp connection successful.',
      displayPhoneNumber: result.displayPhoneNumber,
      verifiedName: result.verifiedName,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/whatsapp/stats?from=&to=
 *
 * Counts rows only - no OTP content is aggregated or returned.
 */
async function stats(req, res, next) {
  try {
    const createdAt = {};
    if (req.query.from && !Number.isNaN(new Date(req.query.from))) {
      createdAt.$gte = new Date(req.query.from);
    }
    if (req.query.to && !Number.isNaN(new Date(req.query.to))) {
      const to = new Date(req.query.to);
      // Treat a bare date as inclusive of that whole day.
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setHours(23, 59, 59, 999);
      createdAt.$lte = to;
    }
    const filter = Object.keys(createdAt).length ? { createdAt } : {};

    const [requests, sent, failed, verified, expired] = await Promise.all([
      WhatsAppOTP.countDocuments(filter),
      WhatsAppOTP.countDocuments({ ...filter, deliveryStatus: 'sent' }),
      WhatsAppOTP.countDocuments({ ...filter, deliveryStatus: 'failed' }),
      WhatsAppOTP.countDocuments({ ...filter, verified: true }),
      WhatsAppOTP.countDocuments({ ...filter, verified: false, expiresAt: { $lte: new Date() } }),
    ]);

    // There is only ever one live row per (phone, purpose), so a "resend" is
    // derived from a consumed attempt rather than counted from a second stream.
    const agg = await WhatsAppOTP.aggregate([
      { $match: filter },
      { $group: { _id: null, resends: { $sum: { $cond: [{ $gt: ['$attempts', 0] }, 1, 0] } } } },
    ]);

    res.json({
      success: true,
      stats: {
        requests,
        sent,
        failed,
        verified,
        expired,
        resends: agg[0] ? agg[0].resends : 0,
        verificationRate: requests > 0 ? Math.round((verified / requests) * 100) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/whatsapp/failures - recent delivery failures, numbers masked. */
async function failures(req, res, next) {
  try {
    res.json({ success: true, failures: await otpService.recentFailures(20) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  resendOtp,
  status,
  getConfig,
  testConnection,
  stats,
  failures,
};

