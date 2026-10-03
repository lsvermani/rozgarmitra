const jwt = require('jsonwebtoken');

/**
 * Signs the session token.
 *
 * The claim set gained an optional `admin: true` marker for the password-based
 * admin login, but `verifyToken` below does not depend on it — old tokens
 * without the marker keep validating, so no existing session is invalidated.
 */
function signToken(user, options = {}) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      mobile: user.mobile,
      ...(options.adminSession ? { admin: true } : {}),
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * Short-lived token for the "change my password" flow. Expiring it forces the
 * client to complete the change before it keeps a full-privilege session.
 */
function signPasswordChangeToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, purpose: 'password_change' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

module.exports = { signToken, verifyToken, signPasswordChangeToken };
