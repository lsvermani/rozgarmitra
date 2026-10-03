/**
 * End-to-end check of the OTP verification audit trail.
 *
 * Drives the real HTTP endpoints and then reads the audit collection back, so
 * it proves the wiring (route -> controller -> service -> model -> UI shape)
 * rather than just the model in isolation.
 *
 * Run with the backend up and ADMIN_OTP_PROVIDER=capcom6 so codes are readable:
 *   node scripts/otp-audit-check.js
 */
const BASE = process.env.CHECK_BASE || 'http://127.0.0.1:5000';
const PATH = 'C:/Users/dell/Downloads/rozgarmitra-mvp/check-results.txt';
const out = [];
const log = (line) => { out.push(line); };

const ADMIN_PHONE = '8699142699';
const WORKER_PHONE = '8699142700';

async function api(path, method = 'POST', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'otp-audit-check/1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

(async () => {
  require('dotenv').config();
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const adminOtp = require('../src/services/adminOtpService');
  const User = require('../src/models/User');

  await db.collection('otpverifications').deleteMany({});
  log('=== 1. Admin: mint a code, then send the WRONG one ===');
  // `issue` is the real issuance path - it just skips the HTTP hop and the SMS,
  // so the test does not need a live provider to know the correct code.
  const adminCode = await adminOtp.issue(ADMIN_PHONE);
  log(`  issued a real code for the admin number (len ${adminCode.length})`);
  const badAdmin = await api('/api/auth/verify-otp', 'POST', { phone: ADMIN_PHONE, otp: '000000' });
  log(`  wrong-code status: ${badAdmin.status}  (expect 4xx)`);

  log('\n=== 2. Admin: send the CORRECT code ===');
  const okAdmin = await api('/api/auth/verify-otp', 'POST', { phone: ADMIN_PHONE, otp: adminCode });
  log(`  correct-code status: ${okAdmin.status}  (expect 200, token issued: ${Boolean(okAdmin.json?.token)})`);

  log('\n=== 3. Worker + job creator: wrong code, then correct code ===');
  // Created if absent so the non-admin path is genuinely exercised rather than
  // only its "no such account" branch. Left behind deliberately: the audit page
  // is most useful when it has rows to show.
  for (const role of ['worker', 'job_creator']) {
    let account = await User.findOne({ mobile: WORKER_PHONE, role });
    if (!account) {
      account = await User.create({ mobile: WORKER_PHONE, role, name: `Audit Test ${role}` });
      log(`  created a ${role} account for ${WORKER_PHONE}`);
    }
    account.otpCode = '123456';
    account.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await account.save();

    const badLeg = await api('/api/auth/verify-otp', 'POST', { phone: WORKER_PHONE, otp: '999999', role });
    const okLeg = await api('/api/auth/verify-otp', 'POST', { phone: WORKER_PHONE, otp: '123456', role });
    log(`  ${role.padEnd(12)} wrong=${badLeg.status} (expect 4xx), correct=${okLeg.status} (expect 200, token: ${Boolean(okLeg.json?.token)})`);
  }

  log('\n=== 4. Non-admin number falls through to the worker handler (404, by design) ===');
  const stranger = await api('/api/auth/verify-otp', 'POST', { phone: '9999999999', otp: '123456' });
  log(`  status: ${stranger.status}  (404 = "no account here", NOT an admin error)`);

  const rows = await db.collection('otpverifications')
    .find({}, { projection: { _id: 0, actorName: 1, role: 1, phoneMasked: 1, channel: 1, purpose: 1, outcome: 1, reason: 1, verifiedAt: 1, ip: 1, platform: 1 } })
    .sort({ verifiedAt: 1, _id: 1 })
    .toArray();

  log(`\n=== 5. Audit rows written (${rows.length}) ===`);
  rows.forEach((r) => {
    log(`  ${new Date(r.verifiedAt).toISOString().slice(11, 19)} | ${String(r.role).padEnd(11)} | ${String(r.outcome).padEnd(7)} | ${String(r.reason || '-').padEnd(16)} | ${r.phoneMasked} | ${r.purpose} | ${r.platform || '-'}`);
  });

  log('\n=== 6. Leak check ===');
  const dump = JSON.stringify(rows);
  log(`  code we just sent (${adminCode}) appears in audit rows? ${dump.includes(adminCode) ? 'YES - LEAK' : 'no'}`);
  const raw = rows.filter((r) => String(r.phoneMasked || '').includes(ADMIN_PHONE) || String(r.phoneMasked || '').includes(WORKER_PHONE));
  log(`  any UNMASKED phone number? ${raw.length ? `YES - LEAK (${raw.length} rows)` : 'no'}`);
  log(`  success rows carrying a reason? ${rows.filter((r) => r.outcome === 'success' && r.reason).length} (expect 0)`);

  // The same number arrives in E.164 from the admin flow and as a bare 10-digit
  // string from the worker flow. If masking did not normalise first, one number
  // would appear as two different rows and search would miss half of them.
  // Compared on shape (digits blanked) plus the country-code prefix, because the
  // subscriber digits legitimately differ between the admin and worker numbers.
  const formats = new Set(rows.map((r) => String(r.phoneMasked || '').replace(/\d/g, '#')));
  const prefixes = new Set(rows.map((r) => String(r.phoneMasked || '').replace(/\d(?=\d{4}$)/g, '#')));
  log(`  distinct mask formats: ${[...formats].join(', ')}`);
  log(`  distinct prefixes:     ${[...prefixes].join(', ')}  (all should start +91)`);
  const allE164 = rows.every((r) => String(r.phoneMasked || '').startsWith('+91'));
  const sameShape = formats.size === 1 && allE164;
  log(`  every row normalised to +91? ${allE164 ? 'yes' : 'NO - MASKING BUG'}`);
  log(`  consistent across flows? ${sameShape ? 'yes' : 'NO - MASKING BUG'}`);

  log('\n=== 7. Filter building ===');
  const { buildOtpFilter } = require('../src/controllers/otpAuditController');
  log(`  role=admin          -> ${JSON.stringify(buildOtpFilter({ role: 'admin' }))}`);
  log(`  outcome=failed      -> ${JSON.stringify(buildOtpFilter({ outcome: 'failed' }))}`);
  log(`  from=2026-01-01     -> ${JSON.stringify(buildOtpFilter({ from: '2026-01-01' }))}`);
  log(`  regex escaped       -> ${buildOtpFilter({ search: 'a.*b' }).$or[0].actorName.source}`);
  log(`  bad userId ignored  -> ${JSON.stringify(buildOtpFilter({ userId: 'not-an-id' }))}`);
  log(`  garbage date ignored-> ${JSON.stringify(buildOtpFilter({ from: 'nonsense' }))}`);

  const hasSuccess = rows.some((r) => r.outcome === 'success');
  const hasFailure = rows.some((r) => r.outcome === 'failed');
  log(`\nRESULT: success rows: ${hasSuccess}, failure rows: ${hasFailure}, leaks: ${dump.includes(adminCode) || raw.length}`);
  await mongoose.disconnect();
  require('fs').writeFileSync(PATH, out.join('\n'));
  process.exit(hasSuccess && hasFailure && !dump.includes(adminCode) && !raw.length ? 0 : 1);
})().catch((err) => {
  require('fs').writeFileSync(PATH, out.join('\n') + `\nFATAL: ${err.stack}`);
  process.exit(1);
});