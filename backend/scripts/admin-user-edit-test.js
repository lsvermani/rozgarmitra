/**
 * Acceptance test for the admin "edit user" feature (name / mobile / role /
 * rating). Runs against the live API and RESTORES every value it changes, so it
 * is safe to re-run and leaves the database as it found it.
 *
 *   node scripts/admin-user-edit-test.js
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const ADMIN_MOBILE = '9999999999';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${extra}`); } };

(async () => {
  await call('POST', '/auth/send-otp', { body: { mobile: ADMIN_MOBILE, role: 'admin' } });
  const login = await call('POST', '/auth/verify-otp', { body: { mobile: ADMIN_MOBILE, otp: '123456', role: 'admin' } });
  const token = login.body.token;
  check('admin session obtained', Boolean(token));
  if (!token) process.exit(1);

  // Pick a worker that is NOT the admin, so self-edit rules don't interfere.
  const list = await call('GET', '/admin/users?role=worker&limit=1', { token });
  const target = list.body.users?.[0];
  check('found a worker to edit', Boolean(target));
  if (!target) process.exit(1);

  const original = { name: target.name, mobile: target.mobile, role: target.role, rating: target.rating };
  console.log(`  (editing ${original.name} / ${original.mobile} / ${original.role} / rating ${original.rating})`);
  const restore = () => call('PUT', `/admin/users/${target._id}`, { token, body: original });

  console.log('\n=== authorisation ===');
  const anon = await call('PUT', `/admin/users/${target._id}`, { body: { name: 'Hacker' } });
  check('anonymous edit rejected (401)', anon.status === 401, `got ${anon.status}`);

  await call('POST', '/auth/send-otp', { body: { mobile: '9000000010', role: 'worker' } });
  const w = await call('POST', '/auth/verify-otp', { body: { mobile: '9000000010', otp: '123456', role: 'worker' } });
  const workerEdit = await call('PUT', `/admin/users/${target._id}`, { token: w.body.token, body: { name: 'Hacker' } });
  check('worker cannot edit users (403)', workerEdit.status === 403, `got ${workerEdit.status}`);

  console.log('\n=== validation ===');
  const badMobile = await call('PUT', `/admin/users/${target._id}`, { token, body: { mobile: '12345' } });
  check('short mobile rejected (400)', badMobile.status === 400, `got ${badMobile.status}`);
  const badRole = await call('PUT', `/admin/users/${target._id}`, { token, body: { role: 'superuser' } });
  check('unknown role rejected (400)', badRole.status === 400, `got ${badRole.status}`);
  const badRating = await call('PUT', `/admin/users/${target._id}`, { token, body: { rating: 9 } });
  check('out-of-range rating rejected (400)', badRating.status === 400, `got ${badRating.status}`);
  const noFields = await call('PUT', `/admin/users/${target._id}`, { token, body: {} });
  check('empty payload rejected (400)', noFields.status === 400, `got ${noFields.status}`);
  const missing = await call('PUT', '/admin/users/000000000000000000000000', { token, body: { name: 'Nobody' } });
  check('unknown user id -> 404', missing.status === 404, `got ${missing.status}`);

  console.log('\n=== happy path ===');
  const renamed = await call('PUT', `/admin/users/${target._id}`, { token, body: { name: 'Edited Name QA', rating: 4.25 } });
  check('name + rating saved (200)', renamed.status === 200);
  check('name round-trips', renamed.body.user?.name === 'Edited Name QA', `got ${renamed.body.user?.name}`);
  check('rating rounded to 1dp', renamed.body.user?.rating === 4.3, `got ${renamed.body.user?.rating}`);

  const promoted = await call('PUT', `/admin/users/${target._id}`, { token, body: { role: 'job_creator' } });
  check('role changed (200)', promoted.status === 200, `got ${promoted.status}`);
  check('role round-trips', promoted.body.user?.role === 'job_creator', `got ${promoted.body.user?.role}`);

  console.log('\n=== duplicate mobile+role is blocked ===');
  const other = await call('GET', '/admin/users?limit=100', { token });
  const clash = other.body.users.find((u) => String(u._id) !== String(target._id) && u.role === 'job_creator');
  if (clash) {
    const dup = await call('PUT', `/admin/users/${target._id}`, { token, body: { mobile: clash.mobile } });
    check('duplicate mobile for same role -> 409', dup.status === 409, `got ${dup.status}`);
  } else {
    console.log('  (no second job_creator to clash with - skipped)');
  }

  console.log('\n=== self-edit protection ===');
  const me = login.body.user;
  const selfRole = await call('PUT', `/admin/users/${me.id}`, { token, body: { role: 'worker' } });
  check('admin cannot demote own role (400)', selfRole.status === 400, `got ${selfRole.status}`);
  const selfMobile = await call('PUT', `/admin/users/${me.id}`, { token, body: { mobile: '9000000099' } });
  check('admin cannot change own mobile (400)', selfMobile.status === 400, `got ${selfMobile.status}`);
  const selfName = await call('PUT', `/admin/users/${me.id}`, { token, body: { name: 'Super Admin' } });
  check('admin CAN still edit own name (200)', selfName.status === 200, `got ${selfName.status}`);

  console.log('\n=== restore everything ===');
  const back = await restore();
  check('target user restored', back.status === 200, `got ${back.status}`);

  const verify = await call('GET', `/admin/users?search=${original.mobile}`, { token });
  const restored = verify.body.users?.find((u) => u.mobile === original.mobile);
  check('mobile unchanged', restored?.mobile === original.mobile, `got ${restored?.mobile}`);
  check('role restored', restored?.role === original.role, `got ${restored?.role}`);
  check('name restored', restored?.name === original.name, `got "${restored?.name}" vs "${original.name}"`);
  check('rating restored', Number(restored?.rating) === Number(original.rating), `got ${restored?.rating} vs ${original.rating}`);

  console.log(`\n${'='.repeat(54)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(54));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
