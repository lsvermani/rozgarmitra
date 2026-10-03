/**
 * Confirms GET /admin/jobs populates the creator's mobile so the Jobs table
 * can display it, and that every row actually carries one.
 *
 *   node scripts/admin-jobs-creator-test.js
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    // An explicit Connection:close keeps Node's fetch from holding a keep-alive
    // socket open, which otherwise trips a libuv assertion on exit and masks
    // the real exit code.
    headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} -> ${extra}`); }
};

(async () => {
  await call('POST', '/auth/send-otp', { body: { mobile: '9999999999', role: 'admin' } });
  const login = await call('POST', '/auth/verify-otp', { body: { mobile: '9999999999', otp: '123456', role: 'admin' } });
  const token = login.body.token;
  check('admin session obtained', Boolean(token));
  if (!token) process.exit(1);

  const res = await call('GET', '/admin/jobs?limit=100', { token });
  const jobs = res.body.jobs || [];
  check('GET /admin/jobs returns rows', res.status === 200 && jobs.length > 0, `status ${res.status} count=${jobs.length}`);

  const populated = jobs.filter((j) => j.creatorId && typeof j.creatorId === 'object').length;
  const withMobile = jobs.filter((j) => j.creatorId?.mobile).length;
  const withName = jobs.filter((j) => j.creatorId?.businessName || j.creatorId?.name).length;

  console.log(`\n  rows: ${jobs.length}`);
  console.log(`  creatorId populated as an object : ${populated}`);
  console.log(`  creator has a mobile            : ${withMobile}`);
  console.log(`  creator has a name              : ${withName}\n`);

  check('creatorId is populated (not a raw id)', populated === jobs.length, `${jobs.length - populated} raw`);
  check('every creator carries a mobile', withMobile === jobs.length, `${jobs.length - withMobile} missing`);
  check('every creator carries a name', withName === jobs.length, `${jobs.length - withName} missing`);

  console.log('=== sample rows as the Jobs table renders them ===');
  for (const j of jobs.slice(0, 5)) {
    const c = j.creatorId || {};
    console.log(`  ${j.title}`);
    console.log(`     creator: ${c.businessName || c.name}   mobile: ${c.mobile || 'MISSING'}`);
  }

  const anon = await call('GET', '/admin/jobs');
  check('anonymous access rejected (401)', anon.status === 401, `got ${anon.status}`);

  console.log(`\n${'='.repeat(52)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(52)}`);
  // Node's fetch (undici) can still be tearing down sockets when the assertions
// finish, and calling process.exit() mid-teardown trips a libuv assertion on
// Windows that masks the real exit code. Set exitCode and give the event loop
// a moment to drain before forcing the process down.
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 150);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });