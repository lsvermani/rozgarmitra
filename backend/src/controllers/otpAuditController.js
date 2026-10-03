const OtpVerification = require('../models/OtpVerification');

/**
 * Backs the OTP Verification Log page: "who proved possession of a phone
 * number, when, and did it succeed?"
 *
 * Read-only and aggregate. Nothing here can create, edit or delete a
 * verification - the collection is written only by `services/otpAuditService`
 * as a side effect of a real sign-in, which is what makes it worth trusting.
 */

/** Cap the page size so a crafted ?limit= cannot pull the whole collection. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 25;

/** Escapes user input before it is used as a RegExp source. */
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(String(id));

/**
 * Builds the Mongo filter for GET /api/admin/otp-verifications.
 * Exported so the filter logic itself can be unit tested.
 */
function buildOtpFilter(query = {}) {
  const filter = {};

  if (query.role) filter.role = String(query.role);
  if (query.outcome) filter.outcome = String(query.outcome);
  if (query.channel) filter.channel = String(query.channel);
  if (query.purpose) filter.purpose = String(query.purpose);
  if (query.userId && isValidObjectId(query.userId)) filter.userId = query.userId;

  // Free-text over the fields an admin would actually search by. Note that the
  // phone is searched in its MASKED form only - see the model docblock.
  const search = String(query.search || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { actorName: rx },
      { phoneMasked: rx },
      { ip: rx },
      { platform: rx },
      { reason: rx },
    ];
  }

  // Inclusive date window: from=2026-10-01&to=2026-10-31
  const verifiedAt = {};
  if (query.from && !Number.isNaN(Date.parse(query.from))) {
    verifiedAt.$gte = new Date(query.from);
  }
  if (query.to && !Number.isNaN(Date.parse(query.to))) {
    // A bare date means "through the end of that day", not midnight at its start.
    const to = new Date(query.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to.setHours(23, 59, 59, 999);
    verifiedAt.$lte = to;
  }
  if (verifiedAt.$gte || verifiedAt.$lte) filter.verifiedAt = verifiedAt;

  return filter;
}

/** GET /api/admin/otp-verifications */
async function listOtpVerifications(req, res, next) {
  try {
    const filter = buildOtpFilter(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));

    const [rows, total] = await Promise.all([
      OtpVerification.find(filter)
        .sort({ verifiedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name mobile role')
        .lean(),
      OtpVerification.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: rows,
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/otp-verifications/summary
 *
 * Headline numbers for the cards above the table. Split by role because the
 * question behind this page is usually "did anyone unexpected get in?", and a
 * single blended total hides exactly that.
 */
async function otpSummary(req, res, next) {
  try {
    // The summary deliberately ignores the search box but keeps role/outcome/
    // channel and the date window, so the cards describe the slice being viewed.
    const filter = buildOtpFilter({ ...req.query, search: '' });

    const [byRole, byOutcome, totals] = await Promise.all([
      OtpVerification.aggregate([
        { $match: filter },
        { $group: { _id: '$role', total: { $sum: 1 }, success: { $sum: { $cond: [{ $eq: ['$outcome', 'success'] }, 1, 0] } } } },
        { $sort: { total: -1 } },
      ]),
      OtpVerification.aggregate([
        { $match: filter },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
      ]),
      OtpVerification.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            success: { $sum: { $cond: [{ $eq: ['$outcome', 'success'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$outcome', 'failed'] }, 1, 0] } },
            // Distinct numbers that ever verified - "how many people", not
            // "how many times someone typed a correct code".
            distinctUsers: { $addToSet: '$userId' },
          },
        },
        { $project: { total: 1, success: 1, failed: 1, distinctUsers: { $size: '$distinctUsers' } } },
      ]),
    ]);

    const t = totals[0] || { total: 0, success: 0, failed: 0, distinctUsers: 0 };
    const outcomeMap = Object.fromEntries(byOutcome.map((r) => [r._id, r.count]));

    res.json({
      success: true,
      total: t.total,
      success: t.success || 0,
      failed: t.failed || 0,
      distinctUsers: t.distinctUsers || 0,
      // A high failure rate against a working provider is the signal this page
      // exists to surface, so it is computed here rather than in the UI.
      successRate: t.total ? Math.round(((t.success || 0) / t.total) * 100) : 0,
      failedCount: outcomeMap.failed || 0,
      byRole: byRole.map((r) => ({ role: r._id, total: r.total, success: r.success })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listOtpVerifications, otpSummary, buildOtpFilter };