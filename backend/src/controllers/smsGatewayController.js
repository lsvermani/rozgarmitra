/**
 * Android SMS gateway API.
 *
 * Used by the Flutter gateway app running on the phone that holds the SIM.
 *
 *   POST   /api/sms-gateway/register   -> deviceId + bearer token (shown once)
 *   POST   /api/sms-gateway/poll       -> claim up to N queued jobs
 *   POST   /api/sms-gateway/report    -> sent / delivered / failed
 *
 * Every call is authenticated with the device's bearer token, sent as
 * `Authorization: Bearer <token>` together with `X-Device-Id`. There is no
 * session cookie and no admin token - a stolen gateway token must not be able to
 * reach anything else, so the two credential spaces stay separate.
 */
const gateway = require('../services/smsGatewayService');
const config = require('../config/otpDelivery');
const audit = require('../services/auditService');
const { maskPhone } = require('../utils/phone');
const cfg = require('../config/smsGateway');

/** Pulls the device behind the request, or explains why it could not. */
async function authDevice(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.split(' ')[1] : '';
  const deviceId = String(req.headers['x-device-id'] || '');

  // A per-device token first; fall back to the shared gateway secret so a
  // single-SIM deployment works without a registration round-trip.
  let device = await gateway.authenticateDevice(deviceId, token);
  if (!device) {
    device = await gateway.authenticateShared(deviceId, token);
  }

  if (!device) {
    return { error: res.status(401).json({ success: false, message: 'Device not registered or token invalid.' }) };
  }
  if (!device.active) {
    return { error: res.status(403).json({ success: false, message: 'This gateway device is disabled.' }) };
  }
  return { device };
}

/**
 * POST /api/sms-gateway/heartbeat
 *
 * Sent every `SMS_GATEWAY_HEARTBEAT_INTERVAL` ms. This is what lets the admin
 * panel say ONLINE / OFFLINE, and - more usefully - lets the backend notice a
 * phone that has lost its SIM before an OTP is queued to it.
 */
async function heartbeat(req, res, next) {
  try {
    const { device, error } = await authDevice(req, res);
    if (error) return error;

    const result = await gateway.recordHeartbeat(device, {
      simStatus: req.body.simStatus,
      networkStatus: req.body.networkStatus,
      appVersion: req.body.appVersion,
      deviceModel: req.body.deviceModel,
    });

    res.json({
      success: true,
      ...result,
      // The server dictates the cadence, so tuning it needs no app update.
      nextHeartbeatSeconds: cfg.getConfig().heartbeatInterval / 1000,
      pollIntervalSeconds: cfg.getConfig().pollInterval / 1000,
      jobTimeoutSeconds: cfg.getConfig().jobTimeoutMs / 1000,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/sms-gateway/register
 * body: { deviceId, name?, phoneNumber? }
 *
 * Open to first contact so a new phone can enrol itself, but it issues a new
 * token on every call, which invalidates any previous one. An attacker cannot
 * use it to *read* anything - registration returns no job data and no phone
 * numbers.
 */
async function register(req, res, next) {
  try {
    const deviceId = String(req.body.deviceId || '').trim();
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(deviceId)) {
      return res.status(400).json({
        success: false,
        message: 'deviceId must be 6-64 characters of letters, digits, dash or underscore.',
      });
    }

    const result = await gateway.registerDevice({
      deviceId,
      name: req.body.name,
      phoneNumber: req.body.phoneNumber,
    });

    audit.record({
      req,
      action: 'sms_gateway.registered',
      module: 'server',
      message: `SMS gateway device ${deviceId} registered.`,
    });

    // The token is returned exactly once and is never stored in clear.
    res.json({ success: true, ...result, note: 'Store this token now; it cannot be retrieved again.' });
  } catch (err) {
    next(err);
  }
}

/** POST /api/sms-gateway/poll - claim queued work. */
async function poll(req, res, next) {
  try {
    const { device, error } = await authDevice(req, res);
    if (error) return error;

    // Sweeping on poll rather than on a timer means a stopped server cannot
    // leave jobs claimed forever: the next poll from any device cleans up.
    await gateway.sweepExpiredLeases();

    const jobs = await gateway.claimJobs(device, req.body.limit);
    // No job means the phone should back off and try again shortly.
    res.json({ success: true, jobs, pollAfterSeconds: jobs.length ? 1 : 5 });
  } catch (err) {
    next(err);
  }
}

/** POST /api/sms-gateway/report - outcome of one job. */
async function report(req, res, next) {
  try {
    const { device, error } = await authDevice(req, res);
    if (error) return error;

    const result = await gateway.reportResult(device, {
      jobId: req.body.jobId,
      status: req.body.status,
      gatewayMessageId: req.body.gatewayMessageId,
      errorCode: req.body.errorCode,
      errorMessage: req.body.errorMessage,
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.reason });
    }

    audit.record({
      req,
      action: `sms_gateway.${result.status}`,
      module: 'server',
      result: result.status === 'failed' ? 'error' : 'success',
      // No recipient number, and never the body.
      message: `SMS job ${maskPhone(req.body.to || '')} reported ${result.status}.`,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** GET /api/sms-gateway/health - public liveness, reveals no configuration. */
async function health(req, res, next) {
  try {
    const summary = await gateway.stats();
    res.json({
      success: true,
      enabled: config.getProviderConfig().provider === 'gateway',
      healthyDevice: await gateway.hasHealthyDevice(),
      queued: summary.queued,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, poll, report, heartbeat, health };
