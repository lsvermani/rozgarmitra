const { verifyToken } = require('../utils/token');
const User = require('../models/User');
const { hasPermission, ALL_PERMISSIONS } = require('../config/permissions');

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Token missing.' });
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }
    if (user.blocked) {
      return res.status(403).json({ success: false, message: 'Your account has been blocked. Contact support.' });
    }

    req.user = user;

    // Track real activity for the "Active / Inactive worker" dashboard cards
    // (§4). Written at most once a minute so a chatty client cannot turn every
    // request into a database write, and the update is deliberately fire-and-
    // forget so a slow write never delays the response.
    const lastActiveAt = user.lastActiveAt ? user.lastActiveAt.getTime() : 0;
    if (Date.now() - lastActiveAt > 60 * 1000) {
      User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to perform this action.' });
    }
    next();
  };
}

/**
 * Granular RBAC guard (§13).
 *
 * `authorize(...roles)` is coarse and stays in place for the already-shipped
 * routes. New admin modules use this instead, so access is expressed as a
 * permission (`workers.edit`) rather than a role name, and a Manager can be
 * granted `profiles.approve` without becoming a full Admin.
 *
 * Always place it *after* `protect`, which is what populates `req.user`.
 *
 *   router.put('/:id', protect, requirePermission('jobs.edit'), handler);
 */
function requirePermission(...permissions) {
  const required = permissions.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Token missing.' });
    }

    const granted = required.filter((permission) => hasPermission(req.user.role, permission));

    if (granted.length !== required.length) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
        required,
      });
    }

    next();
  };
}

/**
 * Attaches the caller's permission list to the response so the frontend can
 * hide or disable controls without duplicating the role rules in JavaScript.
 * The server still enforces every check — this is presentation only.
 */
function describePermissions(req, res, next) {
  if (req.user) {
    req.permissions = ALL_PERMISSIONS.filter((p) => hasPermission(req.user.role, p));
  }
  next();
}

module.exports = { protect, authorize, requirePermission, describePermissions };
