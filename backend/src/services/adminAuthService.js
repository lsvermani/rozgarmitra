const bcrypt = require('bcryptjs');
const { isAdminRole } = require('../config/permissions');

/**
 * Password + lockout policy for the admin panel (§24).
 *
 * Workers and job creators are untouched — they keep using phone + OTP through
 * `services/otpService.js`. This module only adds a second, password-based way
 * in for administrators, so existing sessions keep working.
 *
 * Tunables live here rather than in the schema so the policy is one file.
 */
const POLICY = {
  /** bcrypt cost. 10 is a sane balance for an interactive admin login. */
  SALT_ROUNDS: 10,
  /** Consecutive failures before the account is locked. */
  MAX_ATTEMPTS: 5,
  /** How long an account stays locked. */
  LOCK_MINUTES: 15,
  /** Minimum accepted password length. */
  MIN_LENGTH: 8,
};

const LOCKOUT_MESSAGE = 'Too many failed attempts. This admin account is temporarily locked.';

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), POLICY.SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(String(plain), hash);
  } catch {
    return false;
  }
}

/**
 * Password strength check. Deliberately conservative but not obnoxious: length
 * plus character variety, no forced symbols or digits rule.
 */
function validatePasswordStrength(plain) {
  const value = String(plain || '');
  if (value.length < POLICY.MIN_LENGTH) {
    return `Password must be at least ${POLICY.MIN_LENGTH} characters.`;
  }
  const hasLetter = /[a-zA-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  if (!hasLetter || !hasNumber) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

function isLocked(user) {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
}

/** Human-readable remaining lock time, for the error message. */
function lockMinutesRemaining(user) {
  if (!isLocked(user)) return 0;
  return Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
}

/**
 * Records one failed attempt and locks the account once the threshold is hit.
 * Mutates the document but does not save — the caller decides when to persist,
 * so a failed login can be written in the same `save()` as the attempt counter.
 */
async function registerFailedAttempt(user) {
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  if (user.failedLoginAttempts >= POLICY.MAX_ATTEMPTS) {
    user.lockedUntil = new Date(Date.now() + POLICY.LOCK_MINUTES * 60 * 1000);
  }
  return user;
}

/** Clears the lockout counters after a successful login. */
function clearAttempts(user) {
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  return user;
}

/** The public shape of an authenticated admin (never includes the hash). */
function toPublicAdmin(user) {
  return {
    id: user._id,
    name: user.name,
    mobile: user.mobile,
    email: user.email || '',
    role: user.role,
    verified: user.verified,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: Boolean(user.mustChangePassword),
    language: user.language,
  };
}

module.exports = {
  POLICY,
  LOCKOUT_MESSAGE,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  isLocked,
  lockMinutesRemaining,
  registerFailedAttempt,
  clearAttempts,
  toPublicAdmin,
  isAdminRole,
};
