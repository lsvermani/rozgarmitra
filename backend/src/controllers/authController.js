const User = require('../models/User');
const otpService = require('../services/otpService');
const { deliveryMessage } = require('../services/otpDeliveryService');
const { signToken } = require('../utils/token');
const audit = require('../services/auditService');
const otpAudit = require('../services/otpAuditService');
const admin = require('firebase-admin');

function getFirebaseAuth() {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      throw new Error('Firebase authentication is not configured on the server.');
    }
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  }
  return admin.auth();
}

// POST /api/auth/send-otp
// body: { mobile, role }  role required only on first registration
/**
 * Guards the legacy phone+OTP endpoints against administrator sign-in.
 *
 * Before this, `POST /auth/send-otp { role: 'admin' }` minted a code for ANY
 * number that had an `admin` document, stored it in **plain text** on the User
 * record (`User.otpCode`), and `verifyOtp` accepted it - with `APP_MODE=demo` it
 * accepted a fixed code for every number, no code at all. That is why 9999999999
 * could still reach the panel after the allow-list was introduced.
 *
 * Admin OTP now lives on a separate, hardened path: see
 * `routes/adminOtpRoutes.js` + `services/adminOtpService.js`. The allow-list
 * number is intercepted there on `/auth/verify-otp` before this handler ever
 * runs, so all that is left here is to refuse the role outright. Worker and
 * job-creator logins are completely unaffected.
 */
function refuseAdminRole(res, role) {
  if (role !== 'admin') return false;
  res.status(403).json({
    success: false,
    message: 'Administrator sign-in requires the Admin Panel OTP flow.',
  });
  return true;
}

async function sendOtp(req, res, next) {
  try {
    const { mobile, role, name } = req.body;
    if (refuseAdminRole(res, role)) return;
    const trimmedName = typeof name === 'string' ? name.trim() : '';

    const lookup = role ? { mobile, role } : { mobile };
    let user = await User.findOne(lookup);

    if (!user) {
      if (!role || !['worker', 'job_creator'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'New number detected. Please provide role: "worker" or "job_creator".',
        });
      }
      user = await User.create({ mobile, role, ...(trimmedName ? { name: trimmedName } : {}) });
    }

    // A client-supplied `name` may only fill in a name that is missing. It must
    // never overwrite an existing one: /login-rm used to stash the visitor's
    // name in one shared localStorage key, which was then resent for whichever
    // role tab was active and stamped the worker's name onto the same mobile's
    // job-creator account.
    if (trimmedName && !user.name) {
      user.name = trimmedName;
    }

    const otp = otpService.generateOtp();
    user.otpCode = otp;
    user.otpExpiresAt = otpService.getOtpExpiry();
    await user.save();

    const delivery = await otpService.sendSms(mobile, otp);

    // The delivery result used to be ignored, so a failed send - gateway offline,
    // provider not configured - still answered "OTP sent successfully". The user
    // then waited out a 60-second cooldown for a message that was never going to
    // be sent. A failed delivery must be reported, and must not consume the
    // cooldown either.
    if (delivery && delivery.success === false) {
      // Clear the stored code so the failed attempt cannot be verified later.
      user.otpCode = undefined;
      user.otpExpiresAt = undefined;
      await user.save();
      return res.status(502).json({
        success: false,
        message: deliveryMessage(delivery.errorCode || 'service_not_configured'),
      });
    }

    const payload = {
      success: true,
      message: 'OTP sent successfully.',
      isNewUser: !user.name,
    };

    // Only ever expose the OTP in the API response when running in demo mode,
    // so the frontend can auto-fill it for easy demos. Never do this in production.
    if (otpService.isDemoMode()) {
      payload.demoOtp = otp;
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-otp
// body: { mobile, otp }
async function verifyOtp(req, res, next) {
  try {
    const { mobile, otp, role, name, liveLocation } = req.body;
    if (refuseAdminRole(res, role)) return;

    const user = await User.findOne(role ? { mobile, role } : { mobile }).select('+otpCode +otpExpiresAt');
    if (!user) {
      otpAudit.record({ req, phone: mobile, success: false, reason: 'user_not_found', channel: 'sms', purpose: 'login', role });
      return res.status(404).json({ success: false, message: 'User not found. Please send OTP first.' });
    }
    if (user.blocked) {
      otpAudit.record({ req, user, phone: mobile, success: false, reason: 'blocked', channel: 'sms', purpose: 'login' });
      return res.status(403).json({ success: false, message: 'This account has been blocked.' });
    }

    const valid = otpService.verifyOtp(user, otp);
    if (!valid) {
      await audit.record({
        req,
        user,
        action: 'auth.sign_in',
        module: 'auth',
        event: 'sign_in',
        liveLocation,
        result: 'denied',
        message: 'Invalid or expired OTP.',
      });
      otpAudit.record({ req, user, phone: mobile, success: false, reason: 'invalid_otp', channel: 'sms', purpose: 'login' });
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }

    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    // Only fill a missing name - see the note in sendOtp. A caller must not be
    // able to rename an existing account through the OTP endpoints.
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (trimmedName && !user.name) user.name = trimmedName;
    await user.save();

    // Fire-and-forget so a slow audit write never delays the response.
    audit.recordSignIn(req, user, { liveLocation, method: 'OTP' });
    otpAudit.record({ req, user, phone: mobile, success: true, channel: 'sms', purpose: 'login' });

    const token = signToken(user);

    res.json({
      success: true,
      message: 'OTP verified successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        profileComplete: Boolean(user.name),
        language: user.language,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function firebaseAuth(req, res, next) {
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(req.body.idToken);
    const mobile = decoded.phone_number?.replace(/^\+91/, '');
    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({ success: false, message: 'A valid Indian phone number is required.' });
    }

    let user = await User.findOne(req.body.role ? { mobile, role: req.body.role } : { mobile });
    if (!user) {
      if (!req.body.role) {
        return res.status(400).json({ success: false, message: 'New number detected. Please provide a role.' });
      }
      user = await User.create({ mobile, role: req.body.role });
    }
    if (user.blocked) return res.status(403).json({ success: false, message: 'This account has been blocked.' });

    audit.recordSignIn(req, user, { method: 'Firebase' });

    res.json({
      success: true,
      token: signToken(user),
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        profileComplete: Boolean(user.name),
        language: user.language,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * body: { liveLocation? }
 *
 * Tokens are stateless JWTs, so this does not revoke anything - it records the
 * sign-out for the audit trail and stamps `lastLogoutAt`. The client clears its
 * own stored token regardless of the response, so a failure here must never
 * block a user from logging out.
 */
async function logout(req, res, next) {
  try {
    if (req.user) {
      await audit.recordSignOut(req, req.user, { liveLocation: req.body && req.body.liveLocation });
    }
    res.json({ success: true, message: 'Signed out.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendOtp, verifyOtp, firebaseAuth, logout };

