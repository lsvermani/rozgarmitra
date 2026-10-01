const ConfigAuditLog = require('../models/ConfigAuditLog');

const ALLOWED_ACTIONS = ['save', 'test', 'reset', 'restore', 'unlock', 'denied'];
const ALLOWED_ENVIRONMENTS = ['development', 'testing', 'production', 'unknown'];

/**
 * Removes anything credential-like from a value before it is stored.
 * Mirrors ServerConfig.redact() on the Android side, so a bug in the client can
 * never leak a password into the audit collection.
 */
function redact(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@\s]+@/g, '$1***@')
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://***')
    .slice(0, maxLength);
}

// POST /api/admin/server-config-log   (admin only)
// body: { action, actor, summary, environment?, apiBaseUrl?, platform?, appVersion? }
async function logServerConfigChange(req, res, next) {
  try {
    const { action, actor, summary, environment, apiBaseUrl, platform, appVersion } = req.body || {};

    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `action must be one of: ${ALLOWED_ACTIONS.join(', ')}`,
      });
    }
    if (!summary || String(summary).trim().length < 3) {
      return res.status(400).json({ success: false, message: 'summary is required.' });
    }

    const entry = await ConfigAuditLog.create({
      action,
      // The authenticated admin is authoritative; the client label is only a hint.
      actor: redact(actor || `admin:${req.user.mobile}`, 120) || `admin:${req.user.mobile}`,
      userId: req.user._id,
      summary: redact(summary),
      environment: ALLOWED_ENVIRONMENTS.includes(environment) ? environment : 'unknown',
      apiBaseUrl: redact(apiBaseUrl, 300),
      platform: redact(platform || 'unknown', 40),
      appVersion: redact(appVersion, 40),
    });

    res.status(201).json({ success: true, message: 'Configuration change recorded.', entry });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/server-config-log?limit=50   (admin only)
async function listServerConfigChanges(req, res, next) {
  try {
    const requested = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 50, 1), 200);

    const entries = await ConfigAuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    const total = await ConfigAuditLog.countDocuments();

    res.json({ success: true, total, count: entries.length, entries });
  } catch (err) {
    next(err);
  }
}

module.exports = { logServerConfigChange, listServerConfigChanges, redact };
