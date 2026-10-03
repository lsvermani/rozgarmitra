/**
 * MSG91 OTP Widget authentication.
 *
 * Flow
 * ----
 *   1. GET  /api/auth/msg91/widget-config  -> widgetId + tokenAuth for the client
 *   2. POST /api/auth/msg91/complete       -> the widget's access-token
 *
 * Step 2 is the security boundary. The client is never trusted: whatever it
 * claims to have verified is re-checked against MSG91's *Verify Access Token*
 * endpoint before a session is issued. An attacker who skips the widget and
 * POSTs a made-up token gets nothing.
 *
 * The session issued here is the application's own JWT (`utils/token.js`), the
 * same one every other sign-in path returns, so no downstream code changes.
 */
const User = require('../models/User');
const msg91 = require('../services/msg91Service');
const config = require('../config/msg91');
const audit = require('../services/auditService');
const { signToken } = require('../utils/token');
const { normalisePhone, toNationalNumber, maskPhone } = require('../utils/phone');

const ROLES = ['worker', 'job_creator'];

/**
 * GET /api/auth/msg91/widget-config
 *
 * Hands the client what the MSG91 widget needs to initialise. Feature-gated: when
 * MSG91 is disabled this reports the reason instead of any credential.
 */
async function widgetConfig(req, res) {
  const payload = config.toClientConfig();
  res.json({
    success: true,
    enabled: payload.enabled,
    // Only ever populated when the feature is actually on.
    ...(payload.enabled ? { widgetId: payload.widgetId, tokenAuth: payload.tokenAuth } : {}),
    otpLength: payload.otpLength,
    reason: payload.reason,
  });
}

/**
 * POST /api/auth/msg91/complete
 * body: { accessToken, role?, name?, liveLocation? }
 *
 * Confirms the widget's token with MSG91, then signs the user in - creating the
 * account on first use, exactly as the SMS path does.
 */
async function complete(req, res, next) {
  try {
    const reason = config.unusableReason();
    if (reason) {
      return res.status(503).json({ success: false, message: 'Verification is not available right now.' });
    }

    const accessToken = req.body.accessToken || req.body.token;
    const role = ROLES.includes(req.body.role) ? req.body.role : '';

    const check = await msg91.verifyAccessToken(accessToken);
    if (!check.ok) {
      // Recorded without the token itself.
      audit.record({
        req,
        action: 'auth.msg91_token_rejected',
        module: 'auth',
        event: 'msg91_otp',
        result: 'denied',
        message: 'MSG91 access token could not be confirmed.',
      });
      return res.status(401).json({ success: false, message: check.reason });
    }

    // MSG91 reports the identifier it verified. It is the source of truth here -
    // not whatever phone number the client sent alongside the token.
    const phoneResult = normalisePhone(check.identifier);
    if (!phoneResult.ok) {
      return res.status(400).json({ success: false, message: 'Verified number could not be used.' });
    }
    const nationalNumber = phoneResult.national || toNationalNumber(phoneResult.e164);
    if (!nationalNumber) {
      return res.status(400).json({ success: false, message: 'Verified number could not be used.' });
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

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

    // Only now, with MSG91's confirmation in hand, is the number treated as verified.
    user.phoneVerified = true;
    user.phoneVerifiedAt = new Date();
    user.phoneVerifiedVia = 'whatsapp';
    user.lastLoginAt = new Date();
    user.lastLoginIp = String(req.ip || '').slice(0, 64);
    // A client-supplied name may only fill a missing one, matching the SMS flow.
    if (name && !user.name) user.name = name;
    await user.save();

    audit.recordSignIn(req, user, { liveLocation: req.body.liveLocation, method: 'MSG91' });
    audit.record({
      req,
      user,
      action: 'auth.msg91_verified',
      module: 'auth',
      event: 'msg91_otp',
      message: `Number ${maskPhone(phoneResult.e164)} confirmed via MSG91.`,
    });

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

/** GET /api/auth/msg91/status - lets a client decide whether to offer the widget. */
async function status(req, res) {
  const cfg = config.getConfig();
  res.json({
    success: true,
    enabled: cfg.enabled && config.isConfigured(),
    otpLength: cfg.otpLength,
    reason: config.unusableReason(),
  });
}

/**
 * GET /api/auth/msg91/admin/diagnose
 *
 * Asks MSG91 whether the credentials are good. Admin-only, makes no billable
 * call, and turns "OTP not working" into one specific, actionable verdict.
 */
async function diagnose(req, res, next) {
  try {
    const result = await msg91.checkCredentials();
    audit.record({
      req,
      user: req.user,
      action: 'msg91.diagnose',
      module: 'settings',
      result: result.ok ? 'success' : 'error',
      // The verdict, never the token.
      message: `MSG91 credential check: ${result.verdict}.`,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { widgetConfig, complete, status, diagnose };