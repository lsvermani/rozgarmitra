const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const { redactDeep } = require('../utils/redact');

/**
 * Append-only audit trail (§14).
 *
 * Every helper is deliberately *fire-and-forget*: a failure to write the trail
 * must never break the business action the administrator was performing. That
 * mirrors how `services/notificationService.js` already behaves, so the two are
 * consistent with each other and with the existing error handling.
 */

const KNOWN_MODULES = new Set([
  'auth',
  'users',
  'workers',
  'job_creators',
  'jobs',
  'assignments',
  'profiles',
  'reports',
  'notifications',
  'settings',
  'database',
  'server',
  'security',
  'system',
  'roles',
]);

function normaliseModule(name) {
  const value = String(name || 'system').toLowerCase();
  return KNOWN_MODULES.has(value) ? value : 'system';
}

/**
 * Derives a short, human-readable device/browser label from a user-agent.
 * Deliberately coarse - it is for an admin scanning a log, not fingerprinting.
 */
function describePlatform(userAgent = '') {
  const ua = String(userAgent || '');
  if (!ua) return '';
  const os = /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
        : /Mac OS/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux' : '';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
      : /Chrome\//i.test(ua) ? 'Chrome'
        : /Safari\//i.test(ua) ? 'Safari'
          : /Firefox\//i.test(ua) ? 'Firefox' : '';
  return [browser, os].filter(Boolean).join(' · ') || ua.slice(0, 60);
}

/** Keeps only recognised location fields, each trimmed to a sane length. */
function cleanLocation(location) {
  if (!location || typeof location !== 'object') return null;
  const out = {};
  for (const key of ['address', 'locality', 'city', 'state', 'country', 'pincode']) {
    const value = String(location[key] ?? '').slice(0, 200);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Coordinates are only accepted when both are real, finite numbers.
 *
 * The place names that come alongside them are trimmed and length-capped, and
 * are kept only when non-empty: a blank means "the geocoder could not name this
 * spot", which is stored as blank rather than replaced with a plausible guess.
 */
function cleanLiveLocation(liveLocation) {
  if (!liveLocation || typeof liveLocation !== 'object') return null;
  const lat = Number(liveLocation.latitude ?? liveLocation.lat);
  const lng = Number(liveLocation.longitude ?? liveLocation.lng ?? liveLocation.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const accuracy = Number(liveLocation.accuracy);
  return {
    latitude: lat,
    longitude: lng,
    accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
    // Keeps a GPS fix distinguishable from an IP-derived city-level guess when
    // an administrator reads the trail. Unknown/absent values stay null rather
    // than defaulting to the more impressive-sounding option.
    precision: ['gps', 'city'].includes(liveLocation.precision) ? liveLocation.precision : null,
    // `locality` is accepted as an alias because that is what the reverse
    // geocoder names the neighbourhood field.
    city: String(liveLocation.city ?? liveLocation.locality ?? '').trim().slice(0, 120),
    state: String(liveLocation.state ?? liveLocation.region ?? '').trim().slice(0, 120),
    country: String(liveLocation.country ?? '').trim().slice(0, 120),
    capturedAt: liveLocation.capturedAt ? new Date(liveLocation.capturedAt) : new Date(),
  };
}

/**
 * Records one administrative or authentication action.
 *
 * @param {object} options
 * @param {import('express').Request} [options.req]  Used for user + ip + user-agent.
 * @param {string} options.action                   e.g. 'worker.block'
 * @param {string} options.module                   One of KNOWN_MODULES.
 * @param {string} [options.event]                  'sign_in' | 'sign_out' | ...
 * @param {object} [options.location]               Profile place snapshot.
 * @param {object} [options.liveLocation]           Device-reported coordinates.
 * @param {number} [options.sessionSeconds]         Session length, filled on logout.
 * @param {string} [options.recordId]              Affected document id.
 * @param {string} [options.recordLabel]           Human-readable target, e.g. a name.
 * @param {object} [options.before]                State before the change.
 * @param {object} [options.after]                 State after the change.
 * @param {string} [options.result]                success | denied | error
 * @param {string} [options.message]               Short summary.
 * @param {object} [options.user]                  Explicit actor (defaults to req.user).
 */
async function record({
  req,
  user,
  action,
  module,
  event = '',
  location = null,
  liveLocation = null,
  sessionSeconds = null,
  recordId = '',
  recordLabel = '',
  before = null,
  after = null,
  result = 'success',
  message = '',
} = {}) {
  try {
    const actor = user || (req && req.user) || null;
    // Trust the proxy only when the deployment opted in (see app.js).
    const ip = req ? String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) : '';
    const userAgent = req ? String(req.headers['user-agent'] || '').slice(0, 300) : '';
    // Fall back to the actor's saved profile place when the caller has none.
    const resolvedLocation = cleanLocation(location)
      || cleanLocation(actor && actor.location ? actor.location.toObject?.() ?? actor.location : null);

    await ActivityLog.create({
      userId: actor ? actor._id : null,
      actorName: actor ? String(actor.name || actor.businessName || actor.mobile || 'admin').slice(0, 120) : 'system',
      role: actor ? actor.role : 'system',
      action: String(action || 'unknown').slice(0, 80),
      module: normaliseModule(module),
      event: String(event || '').slice(0, 40),
      location: resolvedLocation,
      liveLocation: cleanLiveLocation(liveLocation),
      platform: describePlatform(userAgent),
      sessionSeconds: Number.isFinite(Number(sessionSeconds)) ? Math.max(0, Math.round(Number(sessionSeconds))) : null,
      recordId: recordId ? String(recordId).slice(0, 64) : '',
      recordLabel: redactDeep(recordLabel, 200) || '',
      before: redactDeep(before),
      after: redactDeep(after),
      ip,
      userAgent,
      result: ['success', 'denied', 'error'].includes(result) ? result : 'success',
      message: redactDeep(message, 500) || '',
    });
  } catch (err) {
    // Never surface an audit failure to the caller.
    console.error('[Audit] Failed to record activity:', err.message);
  }
}

/** Convenience wrapper for a blocked/denied action. */
async function recordDenied(req, action, module, message) {
  await record({ req, action, module, result: 'denied', message });
}

/**
 * Records a sign-in, stamping the actor's `lastLoginAt`/`lastLoginIp`.
 * Used by every authentication path so the Activity Logs page shows worker,
 * job-creator and admin sign-ins consistently.
 */
async function recordSignIn(req, user, { liveLocation = null, method = 'otp' } = {}) {
  const stamp = new Date();
  try {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          lastLoginAt: stamp,
          lastLoginIp: String((req && req.ip) || '').slice(0, 64),
          ...(liveLocation
            ? {
              'location.latitude': liveLocation.latitude,
              'location.longitude': liveLocation.longitude,
            }
            : {}),
        },
      },
    );
  } catch (err) {
    // A failed stamp must not block the login itself.
    console.error('[Audit] Failed to stamp lastLoginAt:', err.message);
  }

  await record({
    req,
    user,
    action: 'auth.sign_in',
    module: 'auth',
    event: 'sign_in',
    liveLocation,
    message: `Signed in via ${method}.`,
  });
}

/**
 * Records a sign-out. `lastLoginAt` is reused as the session start because a
 * user may sign in several times without ever signing out; the duration shown
 * is therefore "since the most recent sign-in", which is what an admin reads
 * it as. `lastLogoutAt` is kept separately on the user.
 */
async function recordSignOut(req, user, { liveLocation = null } = {}) {
  const sessionSeconds = user.lastLoginAt
    ? Math.max(0, Math.round((Date.now() - new Date(user.lastLoginAt).getTime()) / 1000))
    : null;

  try {
    await User.updateOne({ _id: user._id }, { $set: { lastLogoutAt: new Date() } });
  } catch (err) {
    console.error('[Audit] Failed to stamp lastLogoutAt:', err.message);
  }

  await record({
    req,
    user,
    action: 'auth.sign_out',
    module: 'auth',
    event: 'sign_out',
    liveLocation,
    sessionSeconds,
    message: sessionSeconds === null ? 'Signed out.' : `Signed out after ${sessionSeconds}s.`,
  });
}

module.exports = {
  record,
  recordDenied,
  recordSignIn,
  recordSignOut,
  describePlatform,
  KNOWN_MODULES,
};
