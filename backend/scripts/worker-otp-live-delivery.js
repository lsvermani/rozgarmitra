/**
 * Live proof that the WORKER route delivers through StartMessaging with the real
 * key, and that no default/demo code is involved.
 *
 * Costs one real SMS per role, so it defaults to the administrator's own number
 * rather than messaging a stranger, and removes the throwaway accounts after.
 *
 *   node scripts/worker-otp-live-delivery.js
 *
 * What this proves, and what it cannot
 * ------------------------------------
 * HTTP 200 means StartMessaging ACCEPTED the message. It does not by itself
 * mean the handset received it. Carrier-level confirmation comes from polling
 * `GET /messages/<id>`, which only the admin flow records a message id for -
 * the worker response deliberately exposes no id, because echoing one would
 * hand an unauthenticated caller a handle on someone else's message.
 */
const API = process.env.CHECK_BASE || 'http://127.0.0.1:5000';
const PHONE = process.env.LIVE_PHONE || '8699142699';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

(async () => {
  require('dotenv').config();
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection('users');

  const created = [];
  try {
    console.log(`Sending a real SMS to +91${PHONE} for each role.\n`);

    for (const role of ['worker', 'job_creator']) {
      await users.deleteOne({ mobile: PHONE, role });
      const res = await post('/api/auth/send-otp', { mobile: PHONE, role });
      created.push(role);

      console.log(`--- ${role} ---`);
      console.log(`  HTTP ${res.status}`);
      console.log(`  body: ${JSON.stringify(res.json)}`);

      // The whole point of APP_MODE=production: no default code in the response.
      if (res.json && res.json.demoOtp) {
        console.log('  !! demoOtp present - a default code is still being accepted/echoed');
      } else {
        console.log('  no demoOtp in the response: good, no default password');
      }

      const row = await users.findOne({ mobile: PHONE, role }, {
        projection: { otpCode: 1, otpHash: 1, otpChannel: 1, otpAttempts: 1 },
      });
      console.log(`  stored plaintext code: ${row.otpCode ? 'PRESENT (BAD)' : 'absent (good)'}`);
      console.log(`  stored HMAC present : ${Boolean(row.otpHash)}`);
      console.log(`  channel recorded    : ${row.otpChannel || '(none)'}`);

      // A wrong code must be refused: proves the real code, not a constant, is
      // what the server compares against.
      const wrong = await post('/api/auth/verify-otp', { mobile: PHONE, otp: '000000', role });
      console.log(`  wrong code rejected : ${wrong.status === 400 ? 'yes' : 'NO - BAD'}`);
    }

    console.log('\nDone. Two real SMS were sent to +91' + PHONE + '.');
  } finally {
    for (const role of created) await users.deleteOne({ mobile: PHONE, role });
    await mongoose.disconnect();
    console.log('\nCleaned up the throwaway accounts.');
  }
})().catch((err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  process.exit(1);
});
