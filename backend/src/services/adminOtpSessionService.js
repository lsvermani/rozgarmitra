/**
 * Admin Panel OTP session issuance.
 *
 * Reuses the application's existing JWT mechanism (`utils/token.js`) rather than
 * inventing a second one, so an admin signed in over OTP is indistinguishable
 * from one signed in with a password: the same `protect` middleware, the same
 * permissions, the same Activity Logs entries, the same dashboard.
 *
 * Deliberately a separate file from `services/adminAuthService.js`, which owns
 * the *password* policy (bcrypt cost, lockout counters). Mixing the two would
 * risk changing password-login behaviour while adding OTP.
 *
 * Nothing here is new infrastructure - it is the missing "who is this?" bridge
 * between a verified phone number and a User document.
 */
const User = require('../models/User');
const { signToken } = require('../utils/token');
const { isAdminRole } = require('../config/permissions');

/**
 * Finds the administrator account for a verified phone number.
 *
 * `isAdminRole` covers `super_admin`, `admin` and `manager`. The flow therefore
 * works for every administrator, not just the seeded `admin`, but only for a
 * number that is both on the allow-list *and* actually holds an admin account -
 * possession of the OTP alone is never sufficient to mint a session.
 */
async function findAdminByMobile(mobile) {
  const candidates = await User.find({ mobile }).select('role blocked');
  const admin = candidates.find((user) => isAdminRole(user.role));
  return admin || null;
}

/** The shape the frontend stores in `rm_admin_user`. Mirrors `authController`. */
function toPublicAdmin(user) {
  return {
    id: user._id,
    name: user.name,
    mobile: user.mobile,
    email: user.email || '',
    role: user.role,
    verified: user.verified,
    profileComplete: Boolean(user.name),
    language: user.language,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

/**
 * Issues the standard admin JWT for a verified user.
 *
 * `adminSession: true` adds the informational `admin` claim that
 * `adminAuthController` already uses. `verifyToken` does not depend on it, so
 * this cannot invalidate an existing password session.
 */
function issueToken(user) {
  return signToken(user, { adminSession: true });
}

module.exports = { findAdminByMobile, toPublicAdmin, issueToken };