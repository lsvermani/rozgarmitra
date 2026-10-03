/**
 * Records every OTP verification attempt, whatever the role.
 *
 * Fire-and-forget for the same reason `services/auditService.js` is: a slow or
 * failed audit write must never delay or break the sign-in it is describing.
 * A verification that succeeds but is not recorded is a monitoring gap, not a
 * user-visible failure - so the write is awaited nowhere and swallowed here.
 *
 * This module is the ONLY place allowed to write an OTP code... which it never
 * does. There is no parameter for one. That is intentional: the audit needs to
 * know a code was accepted, never what it was.
 */
const OtpVerification = require('../models/OtpVerification');
const { maskPhone, normalisePhone } = require('../utils/phone');
const { describePlatform } = require('./auditService');

/** Roles the UI knows how to label. Anything else is stored as-is. */
const ROLES = Object.freeze(['worker', 'job_creator', 'admin', 'super_admin', 'manager', 'viewer']);

/** Delivery channels, matching the providers this project can use. */
const CHANNELS = Object.freeze(['sms', 'whatsapp', 'startmessaging', 'capcom6', 'gateway']);

/**
 * Masks a number for storage, always from its E.164 form.
 *
 * The three sign-in paths hand us different shapes - the admin flow passes
 * `+918699142699`, the worker flow passes the bare `8699142700` stored on the
 * user document. Masking each raw value would put `+918699****2699` and
 * `8699****2700` in the same column, which reads as two different people and
 * breaks search. Normalising first means one number always looks the same.
 *
 * A number that will not normalise is masked as given rather than dropped: a
 * failed attempt is exactly the row worth keeping.
 */
function maskedPhone(input) {
  const parsed = normalisePhone(input);
  return maskPhone(parsed.ok ? parsed.e164 : input);
}

/** Resolves the role for an attempt, even when no account is involved. */
function resolveRole(user, requested) {
  if (user && ROLES.includes(String(user.role))) return String(user.role);
  if (requested && ROLES.includes(String(requested))) return String(requested);
  return 'unknown';
}

function resolveChannel(requested) {
  const value = String(requested || '').toLowerCase();
  return CHANNELS.includes(value) ? value : 'sms';
}

/**
 * Writes one row.
 *
 * @param {object} entry
 * @param {object|null} [entry.user]     The account, when there is one.
 * @param {string}  entry.phone          Full number; masked before storage.
 * @param {boolean} entry.success
 * @param {string}  [entry.reason]       Machine code for a failure.
 * @param {number}  [entry.attemptsUsed]
 * @param {string}  [entry.channel]
 * @param {string}  [entry.purpose]
 * @param {object}  [entry.req]          Express request, for ip / user agent.
 */
async function record(entry) {
  const { user, phone, success, reason, attemptsUsed, channel, purpose, req } = entry || {};

  try {
    await OtpVerification.create({
      userId: user && user._id ? user._id : null,
      actorName: user ? String(user.name || user.businessName || '').slice(0, 120) : '',
      role: resolveRole(user, entry && entry.role),
      phoneMasked: maskedPhone(phone),
      channel: resolveChannel(channel),
      purpose: String(purpose || 'login').slice(0, 40),
      outcome: success ? 'success' : 'failed',
      reason: success ? '' : String(reason || '').slice(0, 60),
      attemptsUsed: Number.isFinite(Number(attemptsUsed)) ? Number(attemptsUsed) : null,
      platform: describePlatform(req && req.headers ? req.headers['user-agent'] : ''),
      ip: String((req && req.ip) || '').slice(0, 64),
      userAgent: String((req && req.headers && req.headers['user-agent']) || '').slice(0, 300),
      verifiedAt: new Date(),
    });
  } catch (err) {
    // Never surface an audit failure to the caller.
    console.error('[OtpAudit] Failed to record verification:', err.message);
  }
}

module.exports = { record, ROLES, CHANNELS, resolveRole };