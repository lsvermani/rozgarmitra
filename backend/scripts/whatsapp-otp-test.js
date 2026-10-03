/**
 * WhatsApp OTP integration test.
 *
 * Run with the backend up and WHATSAPP_TEST_MODE=true:
 *   WHATSAPP_TEST_MODE=true node scripts/whatsapp-otp-test.js
 *
 * In test mode `send-otp` returns the code as `testOtp` and the Meta call is
 * skipped entirely, so this suite never messages a real handset and never spends
 * Meta conversation quota. Test mode is refused when NODE_ENV=production, so the
 * code can never reach a real user.
 *
 * Covers OTP generation/hashing, verification, expiry, attempt limits, resend
 * protection, phone normalisation, RBAC on the admin surface, and - importantly -
 * that no response or stored document ever contains a plaintext code.
 */
require('dotenv').config();

const mongoose = require('mongoose');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const ADMIN_MOBILE = process.env.ADMIN_MOBILE || '9999999999';
const TEST_MOBILE = '8699142699';

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
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed, raw: text };
}

const section = (title) => console.log(`\n=== ${title} ===`);
(async () => {
  console.log('WhatsApp OTP integration test');
  console.log(`target: ${BASE}\n`);

  const WhatsAppOTP = require('../src/models/WhatsAppOTP');
  const User = require('../src/models/User');
  await mongoose.connect(process.env.MONGO_URI);

  const cleanup = async () => {
    await WhatsAppOTP.deleteMany({ phone: `+91${TEST_MOBILE}` });
    await User.deleteMany({ mobile: TEST_MOBILE });
  };
  await cleanup();

  // -- unit-level: generation + hashing (no server needed) -----------------
  section('A. OTP generation and hashing');
  const otp = require('../src/services/whatsappOtpService');
  const a = otp.generateOtp();
  const b = otp.generateOtp();
  check('OTP is 6 digits', /^[0-9]{6}$/.test(a), a);
  check('two OTPs differ', a !== b, `${a} vs ${b}`);
  const hash = otp.hashOtp(a, '+918699142699');
  check('hash is not the code', hash !== a);
  check('hash is hex sha256 length', /^[0-9a-f]{64}$/.test(hash));
  check('correct code verifies', otp.verifyCode(a, '+918699142699', hash));
  check('wrong code rejected', otp.verifyCode('000000', '+918699142699', hash) === false);
  check('code is bound to its phone', otp.verifyCode(a, '+919999999999', hash) === false);

  // -- phone normalisation --------------------------------------------------
  section('B. Phone normalisation');
  const { normalisePhone, toNationalNumber } = require('../src/utils/phone');
  check('bare 10-digit -> E.164', normalisePhone('8699142699').e164 === '+918699142699');
  check('spaced +91 -> E.164', normalisePhone('+91 86991 42699').e164 === '+918699142699');
  check('091 prefix -> E.164', normalisePhone('0918699142699').e164 === '+918699142699');
  check('too short rejected', normalisePhone('12345').ok === false);
  check('letters rejected', normalisePhone('abc').ok === false);
  check('empty rejected', normalisePhone('').ok === false);
  check('9-digit has no country code -> rejected', normalisePhone('869914269').ok === false);
  check('E.164 -> national form', toNationalNumber('+918699142699') === '8699142699');

  // -- status ---------------------------------------------------------------
  section('C. Status endpoint');
  const st = await call('GET', '/auth/whatsapp/status');
  check('status 200', st.status === 200, String(st.status));
  check('reports expiry seconds', st.body.expiresIn === 300, JSON.stringify(st.body.expiresIn));
  check('reports resend seconds', st.body.resendAfter === 60);
  check('reports max attempts', st.body.maxAttempts === 5);
  check('never returns an OTP', !st.raw.match(/\d{6}/), st.raw);

  // -- send / cooldown / resend --------------------------------------------
  section('D. Send, resend cooldown and validation');
  const bad = await call('POST', '/auth/whatsapp/send-otp', { phone: '12345', role: 'worker' });
  check('invalid number rejected 400', bad.status === 400, String(bad.status));

  const noPhone = await call('POST', '/auth/whatsapp/send-otp', { role: 'worker' });
  check('missing number rejected', noPhone.status === 400, String(noPhone.status));

  const sent = await call('POST', '/auth/whatsapp/send-otp', { phone: TEST_MOBILE, role: 'worker' });
  check('send-otp 200', sent.status === 200, JSON.stringify(sent.body));
  check('send-otp reports expiry', sent.body.expiresIn === 300);
  check('send-otp reports resend window', sent.body.resendAfter === 60);

  const testOtp = sent.body.testOtp;
  check('test mode returned a code', typeof testOtp === 'string' && /^[0-9]{6}$/.test(testOtp || ''), String(testOtp));

  const stored = await WhatsAppOTP.findOne({ phone: `+91${TEST_MOBILE}` }).select('+otpHash');
  check('a record was stored', Boolean(stored));
  check('stored hash is not the plaintext', stored && stored.otpHash !== testOtp);
  check('record starts unverified', stored && stored.verified === false);

  const again = await call('POST', '/auth/whatsapp/resend-otp', { phone: TEST_MOBILE, role: 'worker' });
  check('resend inside cooldown blocked 429', again.status === 429, String(again.status));
  check('cooldown error is user friendly', /wait/i.test(again.body.message || ''), again.body.message);

  // -- verification ---------------------------------------------------------
  section('E. Verification, wrong codes and attempt limits');
  const wrong = await call('POST', '/auth/whatsapp/verify-otp', {
    phone: TEST_MOBILE, otp: '000000', role: 'worker',
  });
  check('wrong code rejected', wrong.status === 400, String(wrong.status));
  check('wrong code message is generic', /incorrect/i.test(wrong.body.message || ''), wrong.body.message);
  check('error never echoes the submitted code', !JSON.stringify(wrong.body).includes('000000'));

  const afterWrong = await WhatsAppOTP.findOne({ phone: `+91${TEST_MOBILE}` }).select('+otpHash attempts');
  check('attempt was counted', afterWrong && afterWrong.attempts === 1, String(afterWrong && afterWrong.attempts));

  const verified = await call('POST', '/auth/whatsapp/verify-otp', {
    phone: TEST_MOBILE, otp: testOtp, role: 'worker', name: 'WhatsApp Tester',
  });
  check('correct code verifies', verified.status === 200, JSON.stringify(verified.body));
  check('verified flag returned', verified.body.verified === true);
  check('an app JWT is issued', typeof verified.body.token === 'string' && verified.body.token.length > 20);
  check('user payload returned', verified.body.user && verified.body.user.mobile === TEST_MOBILE);
  check('phoneVerified reported true', verified.body.user && verified.body.user.phoneVerified === true);

  const user = await User.findOne({ mobile: TEST_MOBILE, role: 'worker' });
  check('account was created', Boolean(user));
  check('account marked phone verified', user && user.phoneVerified === true);
  check('phoneVerifiedAt stamped', user && user.phoneVerifiedAt instanceof Date);

  const replay = await call('POST', '/auth/whatsapp/verify-otp', {
    phone: TEST_MOBILE, otp: testOtp, role: 'worker',
  });
  check('code cannot be replayed', replay.status >= 400, String(replay.status));

  // -- expiry + attempt exhaustion -----------------------------------------
  section('F. Expiry and maximum attempts');
  const expiryMobile = '8699142698';
  await WhatsAppOTP.deleteMany({ phone: `+91${expiryMobile}` });
  const ex = await call('POST', '/auth/whatsapp/send-otp', { phone: expiryMobile, role: 'worker' });
  const exOtp = ex.body.testOtp;
  await WhatsAppOTP.updateOne(
    { phone: `+91${expiryMobile}` },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  const expired = await call('POST', '/auth/whatsapp/verify-otp', {
    phone: expiryMobile, otp: exOtp, role: 'worker',
  });
  check('expired code rejected', expired.status === 400, String(expired.status));
  check('expiry message is user friendly', /expired/i.test(expired.body.message || ''), expired.body.message);

  const attemptMobile = '8699142697';
  await WhatsAppOTP.deleteMany({ phone: `+91${attemptMobile}` });
  const at = await call('POST', '/auth/whatsapp/send-otp', { phone: attemptMobile, role: 'worker' });
  const atOtp = at.body.testOtp;
  let lastStatus = 0;
  for (let i = 0; i < 6; i += 1) {
    const r = await call('POST', '/auth/whatsapp/verify-otp', {
      phone: attemptMobile, otp: '111111', role: 'worker',
    });
    lastStatus = r.status;
  }
  const exhausted = await WhatsAppOTP.findOne({ phone: `+91${attemptMobile}` }).select('attempts');
  check('attempts capped at the configured maximum', exhausted && exhausted.attempts <= 5, String(exhausted && exhausted.attempts));
  check('still rejected after the limit', lastStatus >= 400, String(lastStatus));

  // -- admin surface + RBAC -------------------------------------------------
  section('G. Admin surface is protected');
  const anon = await call('GET', '/auth/whatsapp/admin/config');
  check('anonymous refused 401', anon.status === 401, String(anon.status));
  const anonStats = await call('GET', '/auth/whatsapp/admin/stats');
  check('anonymous stats refused 401', anonStats.status === 401, String(anonStats.status));

  await call('POST', '/auth/send-otp', { mobile: ADMIN_MOBILE });
  const adminLogin = await call('POST', '/auth/verify-otp', {
    mobile: ADMIN_MOBILE, otp: '123456', role: 'admin',
  });
  const adminToken = adminLogin.body.token;
  check('admin can sign in', Boolean(adminToken));

  const cfg = await call('GET', '/auth/whatsapp/admin/config', null, adminToken);
  check('admin reads config 200', cfg.status === 200, String(cfg.status));
  const cfgJson = JSON.stringify(cfg.body);
  check('config never returns the access token', !cfgJson.includes(cfg.body.config.whatsapp.accessTokenHint || '@@none@@'));
  check('token is reported as a boolean', typeof cfg.body.config.whatsapp.accessTokenSet === 'boolean');
  check('token is masked if present', !cfg.body.config.whatsapp.accessTokenHint || cfg.body.config.whatsapp.accessTokenHint.startsWith(String.fromCharCode(0x2022)), cfg.body.config.whatsapp.accessTokenHint);
  check('provider is reported', typeof cfg.body.config.provider === 'string', cfg.body.config.provider);

  const stats = await call('GET', '/auth/whatsapp/admin/stats', null, adminToken);
  check('admin reads stats 200', stats.status === 200, String(stats.status));
  check('stats expose a verification rate', typeof stats.body.stats.verificationRate === 'number');
  check('stats never include an OTP', !JSON.stringify(stats.body).match(/\b\d{6}\b/));

  const fails = await call('GET', '/auth/whatsapp/admin/failures', null, adminToken);
  check('admin reads failures 200', fails.status === 200, String(fails.status));

  // A worker must not reach the admin surface.
  await call('POST', '/auth/send-otp', { mobile: '9000000010', role: 'worker' });
  const workerLogin = await call('POST', '/auth/verify-otp', {
    mobile: '9000000010', otp: '123456', role: 'worker',
  });
  const workerToken = workerLogin.body.token;
  const workerCfg = await call('GET', '/auth/whatsapp/admin/config', null, workerToken);
  check('worker refused from config 403', workerCfg.status === 403, String(workerCfg.status));
  const workerTest = await call('POST', '/auth/whatsapp/admin/test-connection', {}, workerToken);
  check('worker refused from test-connection 403', workerTest.status === 403, String(workerTest.status));

  // -- leak checks ----------------------------------------------------------
  section('H. No plaintext OTP is persisted anywhere');
  const doc = await mongoose.connection.db
    .collection('whatsappotps')
    .findOne({ phone: `+91${TEST_MOBILE}` });
  const docText = JSON.stringify(doc);
  check('stored document has no field equal to the code', !docText.includes(`"${testOtp}"`));
  // The digest is cleared the instant the code is used, so a database snapshot
  // taken between verification and expiry cannot be replayed. Section D already
  // proved a digest is written *before* verification.
  check('used code has its digest cleared', !doc.otpHash, String(doc.otpHash));
  check('record is marked verified', doc.verified === true);

  await cleanup();
  await WhatsAppOTP.deleteMany({ phone: { $in: [`+91${expiryMobile}`, `+91${attemptMobile}`] } });
  await User.deleteMany({ mobile: { $in: [expiryMobile, attemptMobile] } });

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
