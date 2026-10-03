const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const gateway = require('../services/smsGatewayService');
const smsCfg = require('../config/smsGateway');
const { normalisePhone } = require('../utils/phone');
const { register, poll, report, heartbeat, health } = require('../controllers/smsGatewayController');

const router = express.Router();

/**
 * Registration is the only unauthenticated route, because a phone has to enrol
 * itself once. It is limited hard and returns nothing sensitive - only a token
 * for the device that asked. Everything else requires the device bearer token.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many registration attempts.' },
});

/** Generous - a phone polls continuously, and a missed beat is not an attack. */
const pollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Polling too frequently.' },
});

/**
 * GET /api/sms-gateway/jobs
 *
 * The RESTful spelling of the poll route. GET is safe and cacheable-by-proxy in a
 * way POST is not, and a gateway only ever *reads* the queue - so it is offered
 * alongside `POST /poll` rather than replacing it, keeping the existing gateway
 * app working unchanged.
 */
router.get('/jobs', pollLimiter, poll);

/**
 * POST /api/sms-gateway/jobs/:jobId/result
 * body: { status: 'SENT' | 'DELIVERED' | 'FAILED', error? }
 *
 * Upper-case statuses from the spec are normalised; lower-case ones are still
 * accepted so neither spelling breaks.
 */
router.post('/jobs/:jobId/result', pollLimiter, (req, res, next) => {
  const incoming = String(req.body.status || '').toUpperCase();
  req.body.jobId = req.params.jobId;
  // Accept either spelling; the service works in lower case.
  req.body.status = String(req.body.status || '').toLowerCase();
  req.body.gatewayMessageId = req.body.gatewayMessageId || '';
  req.body.errorCode = req.body.errorCode || '';
  req.body.errorMessage = req.body.errorMessage || req.body.error || '';
  return report(req, res, next);
});

/** POST /api/sms-gateway/heartbeat - liveness + SIM/network status. */
router.post('/heartbeat', pollLimiter, heartbeat);

/** GET /api/sms-gateway/health - public liveness, reveals no configuration. */
router.get('/health', health);

router.post('/register', registerLimiter, [
  body('deviceId').isString().isLength({ min: 6, max: 64 }),
  validate,
], register);

router.post('/poll', pollLimiter, poll);

/** Outcome of a claimed job. `/report-result` is kept as an alias. */
router.post('/report', pollLimiter, report);
router.post('/report-result', pollLimiter, report);

/** GET /api/sms-gateway/admin/config - masked configuration for the settings page. */
router.get('/admin/config',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  (req, res) => res.json({ success: true, config: smsCfg.toSafeSummary() }));

/**
 * GET /api/sms-gateway/admin/devices - per-gateway ONLINE/OFFLINE, SIM and
 * network status, so an operator can see why an OTP is not arriving.
 */
router.get('/admin/devices',
  protect,
  requirePermission(PERMISSIONS.LOGS_VIEW),
  async (req, res, next) => {
    try {
      const devices = await gateway.deviceHealth();
      res.json({
        success: true,
        devices,
        healthyDevice: await gateway.hasHealthyDevice(),
        stats: await gateway.stats(),
      });
    } catch (err) { next(err); }
  });

/**
 * POST /api/sms-gateway/admin/test-sms
 *
 * Queues a message to a number the administrator supplies. Restricted to
 * `settings.configure`, and it will not queue unless a gateway has checked in
 * recently - otherwise it would silently pile up messages nobody is sending.
 */
router.post('/admin/test-sms',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  async (req, res, next) => {
    try {
      // Normalise rather than prefixing: a bare 10-digit number is Indian and
      // needs the country code, so `7009800747` must become `+917009800747`.
      // String-building it as `+${phone}` produced `+7009800747`, which is not a
      // valid destination and would silently fail at the carrier.
      const parsed = normalisePhone(req.body.phone);
      if (!parsed.ok) {
        return res.status(400).json({ success: false, message: parsed.reason });
      }
      if (!(await gateway.hasHealthyDevice())) {
        return res.status(503).json({ success: false, message: 'No gateway is online. Start the SMS Gateway app first.' });
      }
      const id = await gateway.enqueue({
        to: parsed.e164,
        body: String(req.body.message || 'Rozgarmitra gateway test message.').slice(0, 300),
        purpose: 'test',
      });
      res.json({ success: true, jobId: id, to: parsed.e164 });
    } catch (err) { next(err); }
  });

/** GET /api/sms-gateway/admin/stats - queue depth and device health. */
router.get('/admin/stats',
  protect,
  requirePermission(PERMISSIONS.LOGS_VIEW),
  async (req, res, next) => {
    try {
      res.json({ success: true, stats: await gateway.stats(), healthyDevice: await gateway.hasHealthyDevice() });
    } catch (err) { next(err); }
  });

/**
 * POST /api/sms-gateway/admin/sweep - release expired leases.
 * Exposed so an operator can clear stuck work without waiting for a poll.
 */
router.post('/admin/sweep',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  async (req, res, next) => {
    try {
      const released = await gateway.sweepExpiredLeases();
      res.json({ success: true, markedUnknown: released });
    } catch (err) { next(err); }
  });

module.exports = router;

