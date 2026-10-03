/**
 * Strips anything credential-like out of a value before it is stored or logged.
 *
 * Single source of truth: the original implementation lived inline in
 * `controllers/configAuditController.js` and is still exported from there for
 * backwards compatibility — it now delegates here, so both the old
 * `configauditlogs` trail and the new `activitylogs` trail redact identically.
 */

/** Object keys whose values are never persisted, whatever the caller passes. */
const SECRET_KEYS = [
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'passwordhash',
  'passwordsalt',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'otp',
  'otpcode',
  'secret',
  'jwtsecret',
  'mongo_uri',
  'mongouri',
  'mongouser',
  'mongopassword',
  'apikey',
  'api_key',
  'secretaccesskey',
  'privatekey',
  'encryptionkey',
];

/** Case-insensitive match, so `passwordHash` and `PASSWORD` are both caught. */
function isSecretKey(key) {
  return SECRET_KEYS.includes(String(key).toLowerCase().replace(/[-\s]/g, ''));
}

/**
 * Redact a single value. Mirrors the Android-side `ServerConfig.redact()` so a
 * client bug can never leak a password into an audit collection.
 */
function redact(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@\s]+@/g, '$1***@')
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://***')
    .slice(0, maxLength);
}

/**
 * Redact an arbitrary structure for storage in an audit trail: secret-looking
 * keys are dropped outright, and every surviving string is pattern-scrubbed.
 * Depth-limited so a cyclic object cannot hang a request.
 */
function redactDeep(value, maxLength = 2000, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value === undefined || value === null) return value ?? null;
  if (typeof value === 'string') return redact(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactDeep(item, maxLength, depth + 1));
  }
  if (typeof value === 'object') {
    // Dates, ObjectIds and Buffers have a sensible toString; keep them readable.
    if (value instanceof Date) return value.toISOString();
    if (value._bsontype || value.__id) return String(value);
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSecretKey(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = redactDeep(val, maxLength, depth + 1);
    }
    return out;
  }
  return redact(String(value), maxLength);
}

/**
 * Only the fields that actually differ, so an audit row stays small and
 * readable instead of dumping two full documents per change.
 */
function diff(before, after, maxLength = 2000) {
  const a = before && typeof before === 'object' ? before : {};
  const b = after && typeof after === 'object' ? after : {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  const changed = {};

  for (const key of keys) {
    if (['_id', '__v', 'updatedAt', 'createdAt'].includes(key)) continue;
    const from = a[key];
    const to = b[key];
    const same = JSON.stringify(from ?? null) === JSON.stringify(to ?? null);
    if (same) continue;
    changed[key] = {
      from: redactDeep(from, 500, 1),
      to: redactDeep(to, 500, 1),
    };
  }

  const serialised = JSON.stringify(changed);
  if (serialised && serialised.length > maxLength) {
    return { _truncated: true, keys: Object.keys(changed) };
  }
  return changed;
}

module.exports = { redact, redactDeep, diff, isSecretKey, SECRET_KEYS };
