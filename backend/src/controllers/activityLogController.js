const ActivityLog = require('../models/ActivityLog');

/** Cap the page size so a crafted ?limit= cannot pull the whole collection. */
const MAX_LIMIT = 200;

/** Escapes user input before it is used as a RegExp source. */
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(String(id));

/**
 * Builds the Mongo filter for GET /api/admin/activity-logs from the query string.
 * Exported so the filter logic itself can be unit tested.
 */
function buildActivityFilter(query = {}) {
  const filter = {};

  if (query.event) filter.event = String(query.event);
  if (query.module) filter.module = String(query.module);
  if (query.role) filter.role = String(query.role);
  if (query.result) filter.result = String(query.result);
  // Ignore a malformed id rather than surfacing a CastError to the client.
  if (query.userId && isValidObjectId(query.userId)) filter.userId = query.userId;

  // Free-text across the fields an admin would actually search by.
  const search = String(query.search || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { actorName: rx },
      { action: rx },
      { message: rx },
      { recordLabel: rx },
      { ip: rx },
      { platform: rx },
      { 'location.city': rx },
      { 'location.locality': rx },
      { 'location.address': rx },
    ];
  }

  // Inclusive date window: from=2026-10-01&to=2026-10-31
  const createdAt = {};
  if (query.from && !Number.isNaN(new Date(query.from))) {
    createdAt.$gte = new Date(query.from);
  }
  if (query.to && !Number.isNaN(new Date(query.to))) {
    const to = new Date(query.to);
    // Treat a bare date as inclusive of that whole day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to.setHours(23, 59, 59, 999);
    createdAt.$lte = to;
  }
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;

  return filter;
}

/**
 * GET /api/admin/activity-logs
 * query: search, event, module, role, result, userId, from, to, page, limit
 *
 * Returns a page of entries plus the distinct values present, so the UI can
 * populate its dropdowns from real data instead of a hardcoded list.
 */
async function listActivityLogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = buildActivityFilter(req.query);

    const [logs, total, events, modules, roles] = await Promise.all([
      ActivityLog.find(filter)
        .populate('userId', 'name businessName mobile role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(filter),
      ActivityLog.distinct('event'),
      ActivityLog.distinct('module'),
      ActivityLog.distinct('role'),
    ]);

    // Distinct actors for the "user" dropdown, capped so the list stays usable.
    const actors = await ActivityLog.aggregate([
      { $match: { userId: { $ne: null } } },
      { $group: { _id: { userId: '$userId', actorName: '$actorName', role: '$role' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 200 },
    ]);

    res.json({
      success: true,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      logs,
      filters: {
        // Entries recorded before sign-in tracking have an empty event; they are
        // excluded so the dropdown only offers meaningful choices.
        events: events.filter(Boolean).sort(),
        modules: modules.filter(Boolean).sort(),
        roles: roles.filter(Boolean).sort(),
        actors: actors.map((a) => ({
          userId: String(a._id.userId),
          actorName: a._id.actorName,
          role: a._id.role,
          count: a.count,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}
/**
 * GET /api/admin/activity-logs/summary
 * Sign-in / sign-out counts per role plus the most recent sign-ins, so the page
 * can show headline figures instead of only a table.
 */
async function activitySummary(req, res, next) {
  try {
    const [byRole, recentSignIns, total] = await Promise.all([
      ActivityLog.aggregate([
        { $match: { event: { $in: ['sign_in', 'sign_out'] } } },
        { $group: { _id: { role: '$role', event: '$event' }, count: { $sum: 1 } } },
      ]),
      ActivityLog.find({ event: 'sign_in' }).sort({ createdAt: -1 }).limit(5).lean(),
      ActivityLog.countDocuments({ event: { $in: ['sign_in', 'sign_out'] } }),
    ]);

    const roles = {};
    for (const row of byRole) {
      const role = row._id.role || 'unknown';
      roles[role] = roles[role] || { role, signIns: 0, signOuts: 0 };
      if (row._id.event === 'sign_in') roles[role].signIns = row.count;
      if (row._id.event === 'sign_out') roles[role].signOuts = row.count;
    }

    res.json({
      success: true,
      totalSessions: total,
      roles: Object.values(roles).sort((a, b) => b.signIns - a.signIns),
      recentSignIns: recentSignIns.map((l) => ({
        id: l._id,
        actorName: l.actorName,
        role: l.role,
        at: l.createdAt,
        location: l.location,
        liveLocation: l.liveLocation,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/activity-logs/live
 * The most recent known position per user, taken from their latest entry that
 * carried coordinates. Answers "where was this person last seen" using only data
 * the app already recorded.
 */
async function liveLocations(req, res, next) {
  try {
    const latest = await ActivityLog.aggregate([
      // `$ne: null` would also match entries where the nested object exists but
      // its coordinates are null (Mongoose always materialises nested paths),
      // so match on the value actually being a number.
      { $match: { 'liveLocation.latitude': { $type: 'number' } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$userId',
          actorName: { $first: '$actorName' },
          role: { $first: '$role' },
          event: { $first: '$event' },
          at: { $first: '$createdAt' },
          liveLocation: { $first: '$liveLocation' },
          location: { $first: '$location' },
        },
      },
      { $sort: { at: -1 } },
      { $limit: 200 },
    ]);

    res.json({
      success: true,
      count: latest.length,
      locations: latest.map((row) => ({
        userId: row._id ? String(row._id) : null,
        actorName: row.actorName,
        role: row.role,
        lastEvent: row.event,
        at: row.at,
        liveLocation: row.liveLocation,
        location: row.location,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listActivityLogs, activitySummary, liveLocations, buildActivityFilter };