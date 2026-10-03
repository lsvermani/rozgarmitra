/**
 * Acceptance test for GET /applications as an administrator: verifies that
 * every column the admin table renders is backed by real data.
 *
 *   node scripts/applications-test.js
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const ADMIN_MOBILE = '9999999999';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

const place = (l) => {
  if (!l) return '';
  const parts = [l.locality, l.city, l.state].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : (l.address || '');
};

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${extra}`); } };

(async () => {
  await call('POST', '/auth/send-otp', { body: { mobile: ADMIN_MOBILE, role: 'admin' } });
  const login = await call('POST', '/auth/verify-otp', { body: { mobile: ADMIN_MOBILE, otp: '123456', role: 'admin' } });
  const token = login.body.token;
  check('admin session obtained', Boolean(token));
  if (!token) process.exit(1);

  const res = await call('GET', '/applications', { token });
  const apps = res.body.applications || [];
  check('GET /applications returns rows', res.status === 200 && apps.length > 0, `status=${res.status} count=${apps.length}`);

  console.log('\n=== the six columns, backed by real data ===');
  const noWorker = apps.filter((a) => !a.workerId?.name).length;
  const noTask = apps.filter((a) => !a.jobId?.title).length;
  const creatorRaw = apps.filter((a) => a.jobId?.creatorId && typeof a.jobId.creatorId === 'string').length;
  const noCreator = apps.filter((a) => {
    const c = a.jobId?.creatorId;
    return !c || !(c.businessName || c.name);
  }).length;
  const noPlace = apps.filter((a) => !place(a.jobId?.location)).length;
  const noApplied = apps.filter((a) => !(a.appliedAt || a.createdAt)).length;
  const noStatus = apps.filter((a) => !a.status).length;

  check(`Worker populated for all rows (${apps.length - noWorker}/${apps.length})`, noWorker === 0, `${noWorker} missing`);
  check(`Task populated for all rows`, noTask === 0, `${noTask} missing`);
  check(`Job creator populated for all rows`, noCreator === 0, `${noCreator} missing`);
  check(`creatorId is an object, not a raw id string`, creatorRaw === 0, `${creatorRaw} raw`);
  check(`Location populated for all rows`, noPlace === 0, `${noPlace} missing`);
  check(`Applied date present for all rows`, noApplied === 0, `${noApplied} missing`);
  check(`Status present for all rows`, noStatus === 0, `${noStatus} missing`);

  console.log('\n=== sample rows as the page renders them ===');
  for (const a of apps.slice(0, 4)) {
    const c = a.jobId?.creatorId || {};
    console.log(`  Worker      : ${a.workerId?.name} (${a.workerId?.mobile})`);
    console.log(`  Task        : ${a.jobId?.title} [${a.jobId?.category}]`);
    console.log(`  Job creator : ${c.businessName || c.name} (${c.mobile})`);
    console.log(`  Location    : ${place(a.jobId?.location)}`);
    console.log(`  Applied     : ${a.appliedAt}`);
    console.log(`  Status      : ${a.status}\n`);
  }

  console.log('=== regression: worker + creator still scoped by role ===');
  await call('POST', '/auth/send-otp', { body: { mobile: '9000000010', role: 'worker' } });
  const w = await call('POST', '/auth/verify-otp', { body: { mobile: '9000000010', otp: '123456', role: 'worker' } });
  const wApps = await call('GET', '/applications', { token: w.body.token });
  const mine = wApps.body.applications || [];
  check('worker sees only their own applications', mine.length > 0 && mine.every((a) => String(a.workerId?._id) === String(w.body.user.id)), `${mine.length} rows`);
  check('worker rows also carry a populated creator', mine.every((a) => a.jobId?.creatorId && typeof a.jobId.creatorId === 'object'));

  const anon = await call('GET', '/applications');
  check('anonymous listing rejected (401)', anon.status === 401, `got ${anon.status}`);

  console.log(`\n${'='.repeat(54)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(54));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
