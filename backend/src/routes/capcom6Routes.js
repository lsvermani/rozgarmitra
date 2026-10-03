const express = require('express');
const rateLimit = require('express-rate-limit');

const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  receive,
  registerWebhook,
  getConfig,
  testConnection,
} = require('../controllers/capcom6WebhookController');

const router = express.Router();

/**
 * capcom6/android-sms-gateway integration.
 *
 * Unlike the pull-based gateway in `smsGatewayRoutes.js`, this app runs an HTTP
 * server and the backend calls *into* it. Delivery receipts come back as signed
 * webhooks, which is why this file also owns a public (but HMAC-verified)
 * endpoint.
 */

// Generous: the phone batches receipts, and retries on non-2xx.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many webhook calls.' },
});

/**
 * POST /api/capcom6/webhook
 *
 * Public in the sense of "no session" - the phone has no JWT - but every request
 * must carry a valid HMAC signature, which is what actually authenticates it.
 */
router.post('/webhook', webhookLimiter, receive);

router.get('/admin/config',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  getConfig);

router.post('/admin/test-connection',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  testConnection);

router.post('/admin/register-webhook',
  protect,
  requirePermission(PERMISSIONS.SETTINGS_CONFIGURE),
  registerWebhook);

module.exports = router;
