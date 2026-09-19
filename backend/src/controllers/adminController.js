const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Report = require('../models/Report');

// GET /api/admin/stats
async function getStats(req, res, next) {
  try {
    const [workers, jobCreators, activeJobs, completedJobs, applications, reports, pendingVerification] =
      await Promise.all([
        User.countDocuments({ role: 'worker' }),
        User.countDocuments({ role: 'job_creator' }),
        Job.countDocuments({ status: { $in: ['POSTED', 'APPLICATIONS_RECEIVED', 'WORKER_SELECTED', 'IN_PROGRESS'] } }),
        Job.countDocuments({ status: { $in: ['COMPLETED', 'RATED'] } }),
        Application.countDocuments({}),
        Report.countDocuments({ status: 'OPEN' }),
        User.countDocuments({ verified: false, role: { $ne: 'admin' } }),
      ]);

    res.json({
      success: true,
      stats: {
        totalUsers: workers + jobCreators,
        workers,
        jobCreators,
        activeJobs,
        completedJobs,
        applications,
        openReports: reports,
        pendingVerification,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/users?role=&search=&blocked=
async function listUsers(req, res, next) {
  try {
    const { role, search, blocked, verified, page = 1, limit = 20 } = req.query;
    const query = {};
    if (role) query.role = role;
    if (blocked !== undefined) query.blocked = blocked === 'true';
    if (verified !== undefined) query.verified = verified === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Number(limit));

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      User.countDocuments(query),
    ]);

    res.json({ success: true, total, page: pageNum, users });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/users/:id/block
async function toggleBlockUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    user.blocked = !user.blocked;
    await user.save();
    res.json({ success: true, message: `User ${user.blocked ? 'blocked' : 'unblocked'}.`, user });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/users/:id/verify
async function verifyUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { verified: true }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, message: 'User verified.', user });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/jobs
async function listAllJobs(req, res, next) {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.title = { $regex: search, $options: 'i' };

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Number(limit));

    const [jobs, total] = await Promise.all([
      Job.find(query)
        .populate('creatorId', 'name businessName mobile')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Job.countDocuments(query),
    ]);

    res.json({ success: true, total, page: pageNum, jobs });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/jobs/:id
async function removeJob(req, res, next) {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    await Application.deleteMany({ jobId: job._id });
    res.json({ success: true, message: 'Job removed by admin.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/reports
async function listReports(req, res, next) {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const reports = await Report.find(query)
      .populate('reporterId', 'name mobile role')
      .populate('reportedUserId', 'name mobile role')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: reports.length, reports });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/reports/:id
async function updateReportStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
    }
    const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!report) return res.status(404).json({ success: false, message: 'Report not found.' });
    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  listUsers,
  toggleBlockUser,
  verifyUser,
  listAllJobs,
  removeJob,
  listReports,
  updateReportStatus,
};
