/**
 * MSG91 server-side OTP API test.
 *
 *   MSG91_API_ENABLED=true MSG91_API_AUTHKEY=<probe key> node scripts/msg91-api-test.js
 *
 * Focus: the authkey must never leak, a rejected key must fail cleanly rather
 * than crash, and MSG91's several failure shapes must all fail *closed*.
 */
require('dotenv').config();

let passed = 0;
let failed = 0;
const check = (label, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? ` ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

(async () => {
  const cfg = require('../src/config/msg91Api');
  const svc = require('../src/services/msg91ApiService');
  const delivery = require('../src/config/otpDelivery');
  const { deliveryMessage } = require('../src/services/otpDeliveryService');

  console.log('MSG91 server-side OTP API test\n');

  section('A. Provider registration');
  check('msg91api is a known provider', delivery.DELIVERY_PROVIDERS.includes('msg91api'));
  check('does not disturb existing providers',
    ['otpdev', 'whatsapp', 'gateway', 'demo'].every((p) => delivery.DELIVERY_PROVIDERS.includes(p)));

  section('B. Config never exposes the authkey');
  const summary = cfg.toSafeSummary();
  const key = process.env.MSG91_API_AUTHKEY || '';
  const serialised = JSON.stringify(summary);
  if (key) {
    check('summary does not contain the authkey', !serialised.includes(key));
    check('authkey reported as a boolean', typeof summary.authkeySet === 'boolean');
    check('authkey masked if present', !summary.authkeyHint || /^[^A-Za-z0-9]{4}/.test(summary.authkeyHint), summary.authkeyHint);
  } else {
    check('authkey reported as not set', summary.authkeySet === false);
  }
  check('template id is not secret and is shown', typeof summary.templateId === 'string');

  section('C. Disabled / unconfigured fails closed');
  const wasEnabled = process.env.MSG91_API_ENABLED;
  process.env.MSG91_API_ENABLED = 'false';
  delete require.cache[require.resolve('../src/config/msg91Api')];
  delete require.cache[require.resolve('../src/services/msg91ApiService')];
  const cfgOff = require('../src/config/msg91Api');
  const svcOff = require('../src/services/msg91ApiService');
  check('disabled reports a reason', Boolean(cfgOff.unusableReason()), cfgOff.unusableReason());
  const offSend = await svcOff.sendOtp('+918699142699', '483921');
  check('send refused while disabled', offSend.ok === false);
  check('refusal uses a known error code', typeof offSend.errorCode === 'string' && offSend.errorCode.length > 0, offSend.errorCode);
  if (wasEnabled) process.env.MSG91_API_ENABLED = wasEnabled;

  section('D. Bad credentials fail cleanly (no crash, no leak)');
  const savedKey = process.env.MSG91_API_AUTHKEY;
  const savedTpl = process.env.MSG91_API_TEMPLATE_ID;
  process.env.MSG91_API_AUTHKEY = 'definitely-not-a-valid-key';
  process.env.MSG91_API_TEMPLATE_ID = '00000000-0000-0000-0000-000000000000';
  process.env.MSG91_API_ENABLED = 'true';
  for (const k of Object.keys(require.cache)) {
    if (k.includes('msg91Api') || k.includes('otpDeliveryService')) delete require.cache[k];
  }
  const svcBad = require('../src/services/msg91ApiService');
  const cred = await svcBad.checkCredentials();
  check('checkCredentials returns a verdict', typeof cred.ok === 'boolean', JSON.stringify(cred));
  const send = await svcBad.sendOtp('+918699142699', '483921');
  check('sendOtp fails rather than throwing', send.ok === false, JSON.stringify(send));
  check('error code is a code, not a message',
    typeof send.errorCode === 'string' && send.errorCode.length < 30, send.errorCode);
  check('no authkey in the result', !JSON.stringify(send).includes('definitely-not-a-valid-key'));
  check('no OTP in the result', !JSON.stringify(send).includes('483921'));

  section('E. Error codes map to safe sentences');
  for (const code of ['401', '1136', '201', '1512', '1513', '1523', 'network_error', 'something_unknown']) {
    const msg = deliveryMessage(code);
    check(`code ${code} -> safe message`, typeof msg === 'string' && msg.length > 10 && msg.length < 120, msg);
    check(`code ${code} never echoed back`, !msg.includes(code), msg);
  }

  section('F. Restore');
  if (savedKey) process.env.MSG91_API_AUTHKEY = savedKey; else delete process.env.MSG91_API_AUTHKEY;
  if (savedTpl) process.env.MSG91_API_TEMPLATE_ID = savedTpl; else delete process.env.MSG91_API_TEMPLATE_ID;

  console.log('\n======================================================');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================');
  // Set the exit code rather than calling process.exit(): MSG91 calls leave
  // keep-alive sockets open, and exiting underneath them trips a libuv
  // assertion on Windows. Letting the loop drain on its own is clean.
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

