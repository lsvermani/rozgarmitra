/**
 * Receives delivery receipts from the capcom6 Android gateway.
 *
 * The app POSTs status changes (sms:sent / sms:delivered / sms:failed) to this
 * endpoint. Those are the *only* trustworthy confirmation that a message left the
 * phone, so they are what flips a job to sent/delivered in the queue.
 *
 * Security: every request is verified against the app's HMAC signature
 * (`X-Signature` over `rawBody + X-Timestamp`) before anything is read. Without
 * that, anyone who can reach this endpoint could mark an undelivered OTP as sent.
 */
const crypto = require('crypto');
const capcom6 = require('../services/capcom6Service');
const SmsJob = require('../models/SmsJob');

/** Delivery status -> the value stored on the job. */
function mapStatus(event) {
  const e = String(event || '').toLowerCase();
  if (e.includes('delivered')) return 'delivered';
  if (e.includes('failed') || e.includes('error')) return 'failed';
  if (e.includes('sent')) return 'sent';
  return null;
}

/** Raw body is required for the HMAC, so it is read as text, not parsed JSON. */
async function rawBody(req) {
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
}

/** Extracts the gateway's own message id from the documented payload shapes. */
function extractMessageId(payload) {
  if (!payload) return '';
  return String(
    payload.messageId ||
    (payload.payload && payload.payload.messageId) ||
    payload.id ||
    '',
  ).slice(0, 120);
}

module.exports = { mapStatus, extractMessageId, rawBody, capcom6, SmsJob, crypto };
/**
 * POST /api/capcom6/webhook
 *
 * Body: `{ "event": "sms:sent", "messageId": "..." }` (or wrapped in `payload`).
 *
 * Always answers 200 once the signature is valid, even for an event we do not
 * model - the app retries on non-2xx, and a retry storm would not help.
 */
async function receive(req, res, next) {
  try {
    const body = await rawBody(req);
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    const verdict = capcom6.verifyWebhook(body, signature, timestamp);
    if (!verdict.ok) {
      // Never echo why in detail, and never look at the payload: an unauthenticated
      // caller has not earned that information.
      return res.status(401).json({ success: false, message: 'Webhook rejected.' });
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid webhook body.' });
    }

    const event = payload.event || '';
    const status = mapStatus(event);
    if (!status) {
      return res.json({ success: true, ignored: true });
    }

    const messageId = extractMessageId(payload);
    if (!messageId) {
      return res.json({ success: true, ignored: true });
    }

    // The job may already be terminal (e.g. sent already reported); do not
    // regress a delivery back to sent.
    const job = await SmsJob.findOneAndUpdate(
      { gatewayMessageId: messageId, status: { $in: ['queued', 'claimed', 'sent'] } },
      {
        $set: {
          status,
          completedAt: new Date(),
          ...(status === 'failed' ? { errorCode: 'gateway_reported_failure' } : {}),
        },
      },
      { new: true },
    );

    res.json({ success: true, matched: Boolean(job) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/capcom6/admin/register-webhook
 * Asks the app to start posting receipts here. Admin-only.
 */
async function registerWebhook(req, res, next) {
  try {
    const result = await capcom6.registerWebhook(req.body.event || 'sms:sent');
    if (!result.ok) {
      return res.status(502).json({ success: false, message: 'Could not register the webhook.', errorCode: result.errorCode });
    }
    res.json({ success: true, message: 'Webhook registered.' });
  } catch (err) {
    next(err);
  }
}

/** GET /api/capcom6/admin/config - masked configuration for the admin screen. */
async function getConfig(req, res) {
  res.json({ success: true, config: require('../config/capcom6').toSafeSummary() });
}

/** POST /api/capcom6/admin/test-connection - proves the app answers. */
async function testConnection(req, res, next) {
  try {
    const result = await capcom6.testConnection();
    if (!result.ok) {
      return res.status(502).json({ success: false, message: 'Could not reach the SMS Gateway app.', errorCode: result.errorCode });
    }
    res.json({ success: true, message: 'SMS Gateway app reachable.', status: result.status });
  } catch (err) {
    next(err);
  }
}

module.exports = { receive, registerWebhook, getConfig, testConnection };
