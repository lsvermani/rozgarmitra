/**
 * Reads the activity trail straight from MongoDB and prints it the way the
 * /admin/logs table does, proving the stored values are complete and usable
 * without going through the API.
 *
 *   node scripts/inspect-activity-logs.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ActivityLog = require('../src/models/ActivityLog');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const workerIns = await ActivityLog.find({ event: 'sign_in', role: 'worker' })
    .sort({ createdAt: -1 }).limit(6).lean();

  console.log('=== worker sign-ins, straight from Mongo ===\n');
  for (const l of workerIns) {
    const place = l.location ? [l.location.locality, l.location.city, l.location.state].filter(Boolean).join(', ') : '-';
    // Mongoose always materialises the nested `liveLocation` object, so its
    // fields can be present but null. The page checks the same way.
    const hasCoords = l.liveLocation && typeof l.liveLocation.latitude === 'number';
    const live = hasCoords ? `${l.liveLocation.latitude.toFixed(3)},${l.liveLocation.longitude.toFixed(3)}` : '-';
    console.log(`  ${(l.actorName || '').padEnd(12)} | ${place.padEnd(38)} | live=${live.padEnd(18)} | ${(l.platform || '-').padEnd(18)} | ${l.ip || '-'}`);
  }

  const session = await ActivityLog.findOne({ event: 'sign_out' }).sort({ sessionSeconds: -1 }).lean();
  console.log(`\n=== session durations ===\n  longest: ${session.sessionSeconds}s (${(session.sessionSeconds / 60).toFixed(1)} min) for ${session.actorName}`);

  const signIns = await ActivityLog.countDocuments({ event: 'sign_in' });
  const signOuts = await ActivityLog.countDocuments({ event: 'sign_out' });
  const denied = await ActivityLog.countDocuments({ result: 'denied' });
  const withLive = await ActivityLog.countDocuments({ 'liveLocation.latitude': { $type: 'number' } });
  const withPlace = await ActivityLog.countDocuments({ 'location.city': { $ne: '' } });

  console.log('\n=== totals ===');
  console.log(`  sign_ins            : ${signIns}`);
  console.log(`  sign_outs           : ${signOuts}`);
  console.log(`  denied attempts     : ${denied}`);
  console.log(`  entries with live   : ${withLive}`);
  console.log(`  entries with place  : ${withPlace}`);

  await mongoose.disconnect();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });