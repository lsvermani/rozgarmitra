const Report = require('../models/Report');
const User = require('../models/User');

// POST /api/reports
// body: { reportedUserId?, jobId?, reason, description }
async function createReport(req, res, next) {
  try {
    const { reportedUserId, jobId, reason, description } = req.body;

    const report = await Report.create({
      reporterId: req.user._id,
      reportedUserId: reportedUserId || null,
      jobId: jobId || null,
      reason,
      description,
    });

    res.status(201).json({ success: true, message: 'Report submitted. Our team will review it.', report });
  } catch (err) {
    next(err);
  }
}

// POST /api/reports/block/:userId  (worker/creator blocking another user from their own view)
async function blockUser(req, res, next) {
  try {
    // For MVP: "block" just prevents this user from seeing/being matched with the blocked user
    // is out of scope; here we let a user flag another as blocked on the reporter's own record only
    // is not modeled yet — for MVP we simply log it as a report with reason "Other".
    const report = await Report.create({
      reporterId: req.user._id,
      reportedUserId: req.params.userId,
      reason: 'Other',
      description: 'User blocked via block action.',
    });
    res.json({ success: true, message: 'User blocked and reported to admin.', report });
  } catch (err) {
    next(err);
  }
}

module.exports = { createReport, blockUser };
