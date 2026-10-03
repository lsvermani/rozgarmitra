/**
 * POST /api/auth/request-otp
 * POST /api/auth/verify-otp
 *
 * The Admin Panel OTP login flow.
 *
 * Request  -> authorise the number, issue a code, send it via the Android SMS
 *             Gateway. Never returns the code (except in explicit test mode).
 * Verify   -> check the code, then mint the application's normal admin JWT.
 *
 * What this controller deliberately never sends to the browser: the OTP, the
 * SMS gateway username/password, the HMAC pepper, a gateway error body, or a
 * stack trace. Every internal failure is collapsed into a short sentence by
 * `services/smsGatewayAdminService.js`.
 */
const otp = require('../services/adminOtpService');
const sms = require('../services/adminSmsService');
const session = require('../services/adminOtpSessionService');
const config = require('../config/adminOtp');
const audit = require('../services/auditService');
const otpAudit = require('../services/otpAuditService');
const { normalisePhone, maskPhone } = require('../utils/phone');

/** Log line for an OTP lifecycle event. Phone is masked, code is absent. */
function logEvent(event, detail) {
  console.log(`[AdminOTP] ${event} ${detail}`);
}

// POST /api/auth/request-otp
// body: { phone }
async function requestOtp(req, res, next) {
  try {
    const reason = config.unusableReason();
    if (reason) {
      logEvent('request_refused', '- reason=service_unavailable');
      return res.status(503).json({ success: false, message: 'Unable to send OTP. Please try again.' });
    }

    const parsed = normalisePhone(req.body.phone);
    if (!parsed.ok) {
      logEvent('request_refused', '- reason=invalid_number');
      return res.status(400).json({ success: false, message: parsed.reason });
    }

    // The allow-list check happens BEFORE anything is generated, hashed or sent,
    // so an unauthorised number cannot cause a gateway call or burn a cooldown.
    if (!otp.isAuthorised(parsed.national)) {
      logEvent('request_refused', `- reason=unauthorized ip=${req.ip}`);
      await audit.record({
        req,
        action: 'auth.otp_requested',
        module: 'security',
        result: 'denied',
        message: 'OTP requested for an unauthorised number.',
      });
      return res.status(403).json({ success: false, message: 'Unauthorized phone number.' });
    }

    // Resend cooldown.
    const current = await otp.status(parsed.national);
    if (current.resendWaitSeconds > 0) {
      logEvent('request_refused', `- reason=cooldown ip=${req.ip}`);
      return res.status(429).json({
        success: false,
        message: `Please wait ${current.resendWaitSeconds} seconds before requesting another OTP.`,
        retryAfterSeconds: current.resendWaitSeconds,
      });
    }

    // Per-number hourly abuse limit. Counted from real rows, so a restart does
    // not reset the budget.
    const cfg = config.getConfig();
    if (current.sentInLastHour >= cfg.perPhoneHourlyLimit) {
      logEvent('request_refused', `- reason=hourly_limit ip=${req.ip}`);
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests. Please try again later.',
      });
    }

    // Generate + store (hashed). Only now do we touch the gateway.
    const code = await otp.issue(parsed.national);
    const delivery = await sms.sendOtpToAdmin(parsed.e164, code);

    await otp.markDelivery(parsed.national, delivery);

    if (!delivery.ok) {
      logEvent('send_failed', `- phone=${maskPhone(parsed.e164)} error=${delivery.errorCode} ip=${req.ip}`);
      await audit.record({
        req,
        action: 'auth.otp_send_failed',
        module: 'security',
        result: 'error',
        message: `SMS gateway delivery failed (${delivery.errorCode}).`,
      });
      return res.status(502).json({
        success: false,
        message: delivery.message || 'Unable to send OTP. Please try again.',
        errorCode: delivery.errorCode,
      });
    }

    logEvent('sent', `- phone=${maskPhone(parsed.e164)} ip=${req.ip}`);

    const payload = {
      success: true,
      message: 'OTP sent successfully to your registered mobile number.',
      // The client uses this to drive the "Resend in Ns" countdown. It is
      // derived from the server policy, so the client cannot shorten it.
      resendAfterSeconds: cfg.otpResendSeconds,
      expiresInSeconds: cfg.otpExpiryMinutes * 60,
      otpLength: cfg.otpLength,
    };

    // Only ever outside production, and only when explicitly enabled.
    if (cfg.testMode) payload.otp = code;

    res.json(payload);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-otp
// body: { phone, otp }
async function verifyOtp(req, res, next) {
  try {
    const parsed = normalisePhone(req.body.phone);
    if (!parsed.ok) {
      logEvent('verify_refused', '- reason=invalid_number');
      return res.status(400).json({ success: false, message: parsed.reason });
    }

    if (!otp.isAuthorised(parsed.national)) {
      logEvent('verify_refused', `- reason=unauthorized ip=${req.ip}`);
      await audit.record({
        req,
        action: 'auth.otp_verify',
        module: 'security',
        result: 'denied',
        message: 'OTP verification attempted for an unauthorised number.',
      });
      otpAudit.record({
        req, phone: parsed.e164, success: false, reason: 'unauthorized',
        channel: 'sms', purpose: 'login',
      });
      return res.status(403).json({ success: false, message: 'Unauthorized phone number.' });
    }

    const verdict = await otp.check({ phone: parsed.national, otp: req.body.otp });

    if (!verdict.ok) {
      logEvent('verify_failed', `- reason=${verdict.code} ip=${req.ip}`);
      await audit.record({
        req,
        action: 'auth.otp_verify',
        module: 'security',
        result: 'denied',
        message: `Admin OTP verification failed (${verdict.code}).`,
      });
      otpAudit.record({
        req, phone: parsed.e164, success: false, reason: verdict.code,
        attemptsUsed: verdict.attemptsUsed, channel: 'sms', purpose: 'login', role: 'admin',
      });
      return res.status(verdict.status).json({
        success: false,
        message: verdict.reason,
        errorCode: verdict.code,
      });
    }

    // The code is proven. Now the number must also map to a real admin account -
    // a valid OTP alone must never be enough to mint a session.
    const admin = await session.findAdminByMobile(parsed.national);
    if (!admin) {
      logEvent('verify_failed', '- reason=no_admin_account');
      otpAudit.record({
        req, phone: parsed.e164, success: false, reason: 'no_admin_account',
        channel: 'sms', purpose: 'login', role: 'admin',
      });
      return res.status(403).json({
        success: false,
        message: 'This account does not have administrator access.',
      });
    }
    if (admin.blocked) {
      logEvent('verify_failed', '- reason=account_blocked');
      otpAudit.record({
        req, user: admin, phone: parsed.e164, success: false, reason: 'blocked',
        channel: 'sms', purpose: 'login', role: 'admin',
      });
      return res.status(403).json({ success: false, message: 'This account has been blocked.' });
    }

    logEvent('verify_ok', `- phone=${maskPhone(parsed.e164)} ip=${req.ip}`);

    // Fire-and-forget, exactly as the other auth paths do, so a slow audit write
    // never delays the response.
    audit.recordSignIn(req, admin, { liveLocation: req.body.liveLocation, method: 'Admin OTP' });
    // The one row that says "an admin really did prove possession of a phone".
    otpAudit.record({
      req, user: admin, phone: parsed.e164, success: true,
      channel: 'sms', purpose: 'login', role: admin.role || 'admin',
    });

    res.json({
      success: true,
      message: 'OTP verified successfully',
      token: session.issueToken(admin),
      user: session.toPublicAdmin(admin),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { requestOtp, verifyOtp };