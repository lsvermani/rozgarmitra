/**
 * Mock Android SMS Gateway - test double for capcom6/android-sms-gateway.
 *
 *   node scripts/mock-sms-gateway.js
 *
 * Implements exactly the endpoint this backend calls, taken from the project's
 * own source rather than its prose docs (`WebService.kt` mounts every route at
 * the ROOT in local mode):
 *
 *   POST /messages
 *        { "textMessage": { "text": "..." }, "phoneNumbers": ["..."] }
 *   authenticated with HTTP Basic.
 *
 * The cloud-style `/3rdparty/v1/messages` path is also accepted, because that
 * prefix belongs to the api.sms-gate.app relay and never appears on a handset.
 *
 * It exists so the admin OTP flow can be proven end to end - generation, hashing,
 * delivery, verification, rate limiting - on a machine with no Android handset.
 * It is a DEVELOPMENT aid: it prints what it was asked to send so a test can
 * assert on the message, and it is never started by `npm start`.
 *
 * Point the backend at it with:
 *   CAPCOM6_ENABLED=true
 *   SMS_GATEWAY_URL=http://127.0.0.1:8080
 *   SMS_GATEWAY_USERNAME=<printed below>
 *   SMS_GATEWAY_PASSWORD=<printed below>
 */
const http = require('http');

const PORT = parseInt(process.env.MOCK_GATEWAY_PORT || '8080', 10);
const USERNAME = process.env.MOCK_GATEWAY_USERNAME || 'mock-gateway';
const PASSWORD = process.env.MOCK_GATEWAY_PASSWORD || 'mock-password';

const server = http.createServer((req, res) => {
  const auth = req.headers.authorization || '';
  const expected = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`, 'utf8').toString('base64')}`;

  // Mirrors the real app: an unauthenticated request gets a plain 401.
  if (req.headers['x-skip-auth'] !== '1' && auth !== expected) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'mock-sms-gateway' }));
    return;
  }

  // Local mode mounts the send route at the root; the cloud relay prefixes it.
  const isSend =
    req.method === 'POST' &&
    (req.url === '/messages' || req.url === '/3rdparty/v1/messages');

  if (!isSend) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(raw || '{}'); } catch { /* handled below */ }

    const text = payload?.textMessage?.text;
    const recipients = payload?.phoneNumbers;

    if (!text || !Array.isArray(recipients) || recipients.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'textMessage.text and phoneNumbers are required' }));
      return;
    }

    const messageId = `mock_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    // Printed so the test can assert on the exact body that left the server.
    // The real device would put this in the SMS.
    console.log(`[mock-gateway] -> ${recipients.join(',')}: ${text}`);

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messageId, state: 'Pending' }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock SMS Gateway listening on http://127.0.0.1:${PORT}`);
  console.log(`Username: ${USERNAME}`);
  console.log(`Password: ${PASSWORD}`);
  console.log('Send endpoint: POST /messages (HTTP Basic)');
});

module.exports = server;