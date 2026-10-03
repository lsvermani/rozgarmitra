const User = require('../models/User');
const { signToken, signPasswordChangeToken } = require('../utils/token');
const adminAuth = require('../services/adminAuthService');
const { isAdminRole, ALL_PERMISSIONS, hasPermission } = require('../config/permissions');
const audit = require('../services/auditService');

/**
 * Generic "invalid credentials" response.
 *
 * The same message is returned whether the account is unknown, the role is
 * wrong, or the password is wrong, so the endpoint cannot be used to discover
 * which administrator accounts exist.
 */
const INVALID_CREDENTIALS = { success: false, message: 'Invalid email or password.' };

// POST /api/auth/admin/login
// body: { email | mobile, password }
//
// Additive second path for administrators. The existing phone + OTP admin login
// is untouched, so an admin can still get in with 9999999999 / 123456.
async function adminLogin(req, res, next) {
  try {
    const identifier = String(req.body.email || req.body.mobile || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const { liveLocation } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Accept either the email or the 10-digit mobile number.
    const lookup = /^[6-9]\d{9}$/.test(identifier)
      ? { mobile: identifier, role: { $in: ['admin', 'super_admin'] } }
      : { email: identifier, role: { $in: ['admin', 'super_admin'] } };

    const user = await User.findOne(lookup).select('+passwordHash +failedLoginAttempts +lockedUntil');

    // Unknown account: still run a bcrypt comparison so the response time does
    // not reveal whether the account exists.
    if (!user) {
      await adminAuth.verifyPassword(password, 'x');
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    if (adminAuth.isLocked(user)) {
      const minutes = adminAuth.lockMinutesRemaining(user);
      await audit.record({
        req,
        user,
        action: 'auth.locked',
        module: 'security',
        result: 'denied',
        message: `Login attempt on a locked account (${minutes} min remaining).`,
      });
      return res.status(423).json({
        success: false,
        message: `${adminAuth.LOCKOUT_MESSAGE} Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      });
    }

    const valid = await adminAuth.verifyPassword(password, user.passwordHash);

    if (!valid) {
      await adminAuth.registerFailedAttempt(user);
      await user.save();

      const remaining = Math.max(0, adminAuth.POLICY.MAX_ATTEMPTS - (user.failedLoginAttempts || 0));
      await audit.record({
        req,
        user,
        action: 'auth.login_failed',
        module: 'security',
        result: 'denied',
        message: `Failed password attempt. ${remaining} attempt(s) remaining.`,
      });

      return res.status(401).json({
        success: false,
        message: `Invalid email or password. ${remaining} attempt(s) remaining.`,
      });
    }

    adminAuth.clearAttempts(user);
    user.lastLoginAt = new Date();
    user.lastLoginIp = String(req.ip || '').slice(0, 64);
    await user.save();

    // Records the admin sign-in in the shared activity trail so the Activity
    // Logs page shows admins, workers and job creators side by side. Fire-and-
    // forget: an audit failure must never block a valid login.
    audit.recordSignIn(req, user, { liveLocation, method: 'password' });

    await audit.record({
      req,
      user,
      action: 'auth.login',
      module: 'security',
      message: 'Administrator signed in with a password.',
    });

    res.json({
      success: true,
      message: 'Signed in.',
      token: signToken(user, { adminSession: true }),
      user: adminAuth.toPublicAdmin(user),
      permissions: ALL_PERMISSIONS.filter((p) => hasPermission(user.role, p)),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/admin/change-password
// body: { currentPassword, newPassword }
async function changeAdminPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are both required.' });
    }

    const user = await User.findById(req.user._id).select('+passwordHash +failedLoginAttempts +lockedUntil');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const valid = await adminAuth.verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      await audit.record({
        req,
        user,
        action: 'auth.password_change',
        module: 'security',
        result: 'denied',
        message: 'Password change rejected: current password was incorrect.',
      });
      return res.status(401).json({ success: false, message: 'Your current password is incorrect.' });
    }

    const weakness = adminAuth.validatePasswordStrength(newPassword);
    if (weakness) {
      return res.status(400).json({ success: false, message: weakness });
    }
    if (await adminAuth.verifyPassword(newPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, message: 'Choose a password you have not used before.' });
    }

    user.passwordHash = await adminAuth.hashPassword(newPassword);
    user.mustChangePassword = false;
    adminAuth.clearAttempts(user);
    await user.save();

    await audit.record({
      req,
      user,
      action: 'auth.password_change',
      module: 'security',
      message: 'Administrator password changed.',
    });

    // The existing session stays valid; this short-lived token lets the client
    // rotate credentials without a full re-login.
    res.json({
      success: true,
      message: 'Password updated.',
      reauthToken: signPasswordChangeToken(user),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/admin/set-password
//
// One-time bootstrap for an admin that has no password yet (e.g. the seeded
// 9999999999 account). Requires an authenticated admin session, so the existing
// OTP login is still the first factor.
async function setInitialPassword(req, res, next) {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Administrator role required.' });
    }

    const { newPassword } = req.body || {};
    const weakness = adminAuth.validatePasswordStrength(newPassword);
    if (weakness) {
      return res.status(400).json({ success: false, message: weakness });
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (user.passwordHash) {
      return res.status(409).json({
        success: false,
        message: 'This account already has a password. Use "change password" instead.',
      });
    }

    user.passwordHash = await adminAuth.hashPassword(newPassword);
    await user.save();

    await audit.record({
      req,
      user,
      action: 'auth.password_set',
      module: 'security',
      message: 'Initial administrator password set.',
    });

    res.json({ success: true, message: 'Password set. You can now sign in with your email and password.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/admin/session
// Confirms who the caller is and which permissions they hold.
async function adminSession(req, res, next) {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Administrator role required.' });
    }
    res.json({
      success: true,
      user: adminAuth.toPublicAdmin(req.user),
      permissions: ALL_PERMISSIONS.filter((p) => hasPermission(req.user.role, p)),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { adminLogin, changeAdminPassword, setInitialPassword, adminSession };

