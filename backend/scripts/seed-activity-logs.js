/**
 * Generates realistic sign-in / sign-out activity for all three roles so the
 * Activity Logs page can be reviewed with meaningful data, then prints exactly
 * what an admin would see.
 *
 *   node scripts/seed-activity-logs.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const ActivityLog = require('../src/models/ActivityLog');
const User = require('../src/models/User');

const PLACES = [
  { locality: 'Shahdara', city: 'New Delhi', state: 'Delhi', pincode: '110032' },
  { locality: 'Lajpat Nagar', city: 'New Delhi', state: 'Delhi', pincode: '110024' },
  { locality: 'Sector 18', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301' },
  { locality: 'Koramangala', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' },
  { locality: 'Andheri West', city: 'Mumbai', state: 'Maharashtra', pincode: '400053' },
];
const COORDS = [
  { latitude: 28.5677, longitude: 77.2193, accuracy: 18 },
  { latitude: 28.5941, longitude: 77.1369, accuracy: 32 },
  { latitude: 28.5709, longitude: 77.3260, accuracy: 55 },
  { latitude: 12.9352, longitude: 77.6245, accuracy: 21 },
  { latitude: 19.0728, longitude: 72.8827, accuracy: 44 },
];
const DEVICES = ['Chrome · Windows', 'Safari · iOS', 'Chrome · Android', 'Edge · Windows', 'Safari · macOS'];

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const workers = await User.find({ role: 'worker' }).select('name mobile location').lean();
  const creators = await User.find({ role: 'job_creator' }).select('name businessName mobile location').lean();
  const admins = await User.find({ role: 'admin' }).select('name mobile location').lean();

  const people = [
    ...workers.map((u) => ({ ...u, label: u.name || u.mobile, role: 'worker' })),
    ...creators.map((u) => ({ ...u, label: u.businessName || u.name || u.mobile, role: 'job_creator' })),
    ...admins.map((u) => ({ ...u, label: u.name || 'Super Admin', role: 'admin' })),
  ];
  console.log(`seeding activity for ${workers.length} workers, ${creators.length} creators, ${admins.length} admins\n`);

  // Start from a clean slate so repeated runs stay predictable.
  await ActivityLog.deleteMany({ action: { $in: ['auth.sign_in', 'auth.sign_out'] } });

  const rows = [];
  const pick = (arr, i) => arr[i % arr.length];

  for (let i = 0; i < 36; i += 1) {
    const person = pick(people, i);
    const place = pick(PLACES, i);
    const coords = pick(COORDS, i);
    const device = pick(DEVICES, i);
    // Spread over the last ~3 days.
    const signedInAt = new Date(Date.now() - (i * 2 + 1) * 60 * 60 * 1000);
    const sessionMinutes = 5 + (i * 7) % 180;
    const signedOutAt = new Date(signedInAt.getTime() + sessionMinutes * 60 * 1000);

    const base = {
      userId: person._id,
      actorName: person.label,
      role: person.role,
      module: 'auth',
      location: place,
      platform: device,
      ip: i % 3 === 0 ? '127.0.0.1' : `49.36.${i % 250}.${(i * 7) % 250}`,
      userAgent: `${device} agent`,
    };

    rows.push({
      ...base,
      action: 'auth.sign_in',
      event: 'sign_in',
      liveLocation: { ...coords, capturedAt: signedInAt },
      message: `Signed in via ${person.role === 'admin' ? 'password' : 'OTP'}.`,
      result: 'success',
      createdAt: signedInAt,
      updatedAt: signedInAt,
    });

    // Every third session is left open (no sign-out yet).
    if (i % 3 !== 0) {
      rows.push({
        ...base,
        action: 'auth.sign_out',
        event: 'sign_out',
        liveLocation: { ...coords, capturedAt: signedOutAt },
        sessionSeconds: sessionMinutes * 60,
        message: `Signed out after ${sessionMinutes * 60}s.`,
        result: 'success',
        createdAt: signedOutAt,
        updatedAt: signedOutAt,
      });
    }
  }
// A couple of denied attempts so the Result filter has something to show.
  rows.push({
    userId: workers[0]?._id || null,
    actorName: workers[0]?.name || 'Unknown',
    role: 'worker',
    action: 'auth.sign_in',
    event: 'sign_in',
    module: 'auth',
    message: 'Invalid or expired OTP.',
    result: 'denied',
    ip: '127.0.0.1',
    platform: 'Chrome · Windows',
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
  });

  await ActivityLog.insertMany(rows);
  const total = await ActivityLog.countDocuments();
  console.log(`inserted ${rows.length} entries; activitylogs now holds ${total}\n`);

  // Show an admin exactly what the page will render.
  await call('POST', '/auth/send-otp', { mobile: '9999999999', role: 'admin' });
  const login = await call('POST', '/auth/verify-otp', { mobile: '9999999999', otp: '123456', role: 'admin' });
  const res = await call('GET', '/admin/activity-logs?limit=100', null, login.body.token);

  const fmt = (d) => new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(d));
  const dur = (s) => (s === null || s === undefined ? '—'
    : s < 60 ? `${s}s`
      : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
        : `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`);
  const placeOf = (l) => (l ? [l.locality, l.city, l.state].filter(Boolean).join(', ') : '—');

  console.log('=== what /admin/logs shows ===\n');
  for (const l of (res.body.logs || []).slice(0, 10)) {
    const live = l.liveLocation;
    console.log(`  ${fmt(l.createdAt).padEnd(20)} ${(l.actorName || '').slice(0, 18).padEnd(18)} ${String(l.role).padEnd(12)} ${String(l.event || '-').padEnd(9)}`);
    console.log(`     place=${placeOf(l.location)}`);
    console.log(`     live=${live ? `${live.latitude.toFixed(4)},${live.longitude.toFixed(4)} +/-${live.accuracy}m` : '-'}`);
    console.log(`     session=${dur(l.sessionSeconds).padEnd(8)} device=${(l.platform || '-').padEnd(20)} ip=${l.ip || '-'} result=${l.result}\n`);
  }
  console.log(`  total=${res.body.total} pages=${res.body.pages}`);
  console.log(`  dropdown events : ${(res.body.filters?.events || []).join(', ')}`);
  console.log(`  dropdown roles  : ${(res.body.filters?.roles || []).join(', ')}`);
  console.log(`  dropdown people : ${(res.body.filters?.actors || []).length} actors`);

  await mongoose.disconnect();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });