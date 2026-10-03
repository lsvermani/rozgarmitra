/**
 * MSG91 OTP Widget integration test.
 *
 *   MSG91_ENABLED=true node scripts/msg91-otp-test.js
 *
 * The point of this suite is the **trust boundary**: the widget runs in the
 * client and claims success, so the backend must independently refuse anything
 * MSG91 did not actually verify. Every "forged"/"invalid" case below must be
 * rejected, and no account may be created or marked verified as a result.
 */
require('dotenv').config();

const mongoose = require('mongoose');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const ADMIN_MOBILE = process.env.ADMIN_MOBILE || '9999999999';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` ${detail}` : ''}`);
  }
}

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, raw: text };
}

const section = (title) => console.log(`\n=== ${title} ===`);
(async () => {
  console.log('MSG91 OTP Widget integration test');
  console.log(`target: ${BASE}\n`);

  const User = require('../src/models/User');
  await mongoose.connect(process.env.MONGO_URI);
  const before = await User.countDocuments({ phoneVerified: true });

  section('A. Status and widget configuration');
  const status = await call('GET', '/auth/msg91/status');
  check('status endpoint 200', status.status === 200, String(status.status));
  check('status reports enabled flag', typeof status.body.enabled === 'boolean');

  const cfg = await call('GET', '/auth/msg91/widget-config');
  check('widget-config 200', cfg.status === 200, String(cfg.status));

  const enabled = cfg.body.enabled === true;
  if (enabled) {
    check('widget id supplied when enabled', Boolean(cfg.body.widgetId));
    check('token supplied when enabled (widget cannot boot without it)', Boolean(cfg.body.tokenAuth));
  } else {
    // The important safety property: disabled means NO credential is emitted.
    check('no widget id leaked while disabled', !cfg.body.widgetId, String(cfg.body.widgetId));
    check('no token leaked while disabled', !cfg.body.tokenAuth, String(cfg.body.tokenAuth));
    check('a reason is given', Boolean(cfg.body.reason));
    console.log('  (MSG91 disabled - credential-leak checks are the active ones)');
  }

  section('B. Validation rejects malformed requests');
  const noToken = await call('POST', '/auth/msg91/complete', { role: 'worker' });
  check('missing token rejected', noToken.status === 400, String(noToken.status));
  const shortToken = await call('POST', '/auth/msg91/complete', { accessToken: 'abc' });
  check('absurdly short token rejected', shortToken.status === 400, String(shortToken.status));
  const badRole = await call('POST', '/auth/msg91/complete', { accessToken: 'a'.repeat(40), role: 'admin' });
  check('admin role refused by validation', badRole.status === 400, String(badRole.status));

  section('C. Trust boundary: forged / unverified tokens are refused');
  // These mimic an attacker skipping the widget and posting invented tokens.
  const forgeries = [
    ['structurally valid but unsigned JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJpZGVudGlmaWVyIjoiOTE4Njk5MTQyNjk5In0.forged'],
    ['random string', 'a'.repeat(64)],
    ['empty-ish padded string', '                    '],
    ['looks like a real token prefix', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signature'],
  ];
  for (const [label, token] of forgeries) {
    const res = await call('POST', '/auth/msg91/complete', { accessToken: token, role: 'worker' });
    check(`${label} refused`, res.status >= 400, `got ${res.status}`);
    check(`${label} no session issued`, !res.body || !res.body.token);
  }

  section('D. No account is created or verified by a failed attempt');
  const after = await User.countDocuments({ phoneVerified: true });
  check('no new verified accounts', after === before, `${before} -> ${after}`);
  const forgedUser = await User.findOne({ phoneVerified: true, lastLoginIp: /::ffff:127|::1|127\.0\.0\.1/ });
  check('no account marked verified from this test run', !forgedUser);

  section('E. Errors never leak internals');
  const probe = await call('POST', '/auth/msg91/complete', { accessToken: 'a'.repeat(64), role: 'worker' });
  const text = JSON.stringify(probe.body || {});
  check('no stack trace in response', !/at\s+\w+\s+\(/.test(text), text.slice(0, 120));
  check('no MSG91 host leaked', !/msg91\.com/.test(text));
  check('no auth token echoed', !/tokenAuth|authkey/i.test(text));
  check('message is user-safe', !text.includes('Error:'), text.slice(0, 120));

  section('F. Admin surface is protected');
  const anon = await call('GET', '/auth/msg91/admin/config');
  check('anonymous refused 401', anon.status === 401, String(anon.status));

  await call('POST', '/auth/send-otp', { mobile: ADMIN_MOBILE });
  const adminLogin = await call('POST', '/auth/verify-otp', { mobile: ADMIN_MOBILE, otp: '123456', role: 'admin' });
  const adminToken = adminLogin.body.token;
  check('admin can sign in', Boolean(adminToken));

  const adminCfg = await call('GET', '/auth/msg91/admin/config', null, adminToken);
  check('admin reads config 200', adminCfg.status === 200, String(adminCfg.status));
  const adminJson = JSON.stringify(adminCfg.body);
  check('admin view never returns the token', !adminJson.includes(String(adminCfg.body.config.tokenAuth || '@@none@@')));
  check('token reported as boolean', typeof adminCfg.body.config.tokenAuthSet === 'boolean');
  check('token masked if present', !adminCfg.body.config.tokenAuthHint || /^[^A-Za-z0-9]{4}/.test(adminCfg.body.config.tokenAuthHint), adminCfg.body.config.tokenAuthHint);

  await call('POST', '/auth/send-otp', { mobile: '9000000010', role: 'worker' });
  const workerLogin = await call('POST', '/auth/verify-otp', { mobile: '9000000010', otp: '123456', role: 'worker' });
  const workerCfg = await call('GET', '/auth/msg91/admin/config', null, workerLogin.body.token);
  check('worker refused 403', workerCfg.status === 403, String(workerCfg.status));

  console.log('\n======================================================');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================');
  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error('FATAL', err);
  await mongoose.disconnect();
  process.exit(1);
});
