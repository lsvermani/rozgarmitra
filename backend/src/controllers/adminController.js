const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Report = require('../models/Report');
const Category = require('../models/Category');
const audit = require('../services/auditService');
const mongoose = require('mongoose');

/**
 * Roles an administrator may assign. This mirrors the `role` enum on the User
 * schema exactly. The RBAC table in config/permissions.js also knows about
 * `super_admin` / `manager` / `viewer`, but the schema has not been widened to
 * store them yet, so they are deliberately NOT offered here.
 */
const ASSIGNABLE_ROLES = ['worker', 'job_creator', 'admin'];

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

// PUT /api/admin/users/:id
// body: { name?, mobile?, role?, rating? }
//
// Lets an administrator correct a user's details. Only the four fields the
// admin panel exposes are accepted — everything else on the document is left
// alone, so this can never be used to escalate privileges or overwrite profile
// data. Every change is written to the audit trail.
async function updateUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const updates = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ success: false, message: 'Name must be between 2 and 60 characters.' });
      }
      updates.name = name;
    }

    if (req.body.mobile !== undefined) {
      const mobile = String(req.body.mobile).trim();
      if (!/^[6-9]\d{9}$/.test(mobile)) {
        return res.status(400).json({ success: false, message: 'Enter a valid 10-digit Indian mobile number.' });
      }
      updates.mobile = mobile;
    }

    if (req.body.role !== undefined) {
      if (!ASSIGNABLE_ROLES.includes(req.body.role)) {
        return res.status(400).json({
          success: false,
          message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`,
        });
      }
      updates.role = req.body.role;
    }

    if (req.body.rating !== undefined) {
      const rating = Number(req.body.rating);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be a number between 0 and 5.' });
      }
      // One decimal place, matching how createRating recalculates the average.
      updates.rating = Math.round(rating * 10) / 10;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No editable fields were supplied.' });
    }

    // Guard against an administrator locking themselves out: the mobile number
    // is the primary sign-in identifier, and demoting your own role removes
    // your only route back into this panel.
    const isSelf = String(user._id) === String(req.user._id);
    if (isSelf && (updates.role !== undefined || updates.mobile !== undefined)) {
      await audit.record({
        req,
        user: req.user,
        action: 'user.self_edit_denied',
        module: 'users',
        recordId: String(user._id),
        recordLabel: user.mobile,
        result: 'denied',
        message: 'Blocked an attempt to change own role or mobile number.',
      });
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own role or mobile number. Ask another administrator to do it.',
      });
    }

    // `mobile` + `role` carry a unique index, so check for a clash first and
    // return a readable message instead of a raw duplicate-key error.
    if (updates.mobile !== undefined || updates.role !== undefined) {
      const nextMobile = updates.mobile ?? user.mobile;
      const nextRole = updates.role ?? user.role;
      const clash = await User.findOne({ mobile: nextMobile, role: nextRole, _id: { $ne: user._id } });
      if (clash) {
        return res.status(409).json({
          success: false,
          message: 'Another account already exists with that mobile number for this role.',
        });
      }
    }

    const before = {
      name: user.name,
      mobile: user.mobile,
      role: user.role,
      rating: user.rating,
    };

    Object.assign(user, updates);
    await user.save();

    await audit.record({
      req,
      user: req.user,
      action: 'user.update',
      module: 'users',
      recordId: String(user._id),
      recordLabel: user.name || user.mobile,
      before,
      after: updates,
      message: `Updated: ${Object.keys(updates).join(', ')}.`,
    });

    res.json({ success: true, message: 'User updated.', user });
  } catch (err) {
    // Belt and braces: a duplicate-key race still lands here.
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Another account already exists with that mobile number for this role.',
      });
    }
    next(err);
  }
}

// PUT /api/admin/jobs/:id
// body: { title?, category?, creatorId?, payment? }
//
// Lets an administrator correct a job. Only the four fields the admin panel
// exposes are accepted; status, workers, applications and every other part of
// the document are left untouched, so this cannot be used to tamper with the
// work-assignment flow. Every change is written to the audit trail.
async function updateJob(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job id.' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const updates = {};

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (title.length < 2 || title.length > 160) {
        return res.status(400).json({ success: false, message: 'Title must be between 2 and 160 characters.' });
      }
      updates.title = title;
    }

    if (req.body.category !== undefined) {
      const category = String(req.body.category).trim();
      // Categories live in their own collection; refuse anything that is not a
      // real (active) category so a typo cannot create an orphan value that
      // then shows up in every category filter.
      const exists = await Category.findOne({ name: category, active: true });
      if (!exists) {
        return res.status(400).json({ success: false, message: `Unknown category "${category}". Pick one from the list.` });
      }
      updates.category = category;
    }

    if (req.body.creatorId !== undefined) {
      if (!mongoose.isValidObjectId(req.body.creatorId)) {
        return res.status(400).json({ success: false, message: 'Invalid creator id.' });
      }
      // A job must belong to a job creator. Every existing job already
      // satisfies this, and keeping it true stops the admin from accidentally
      // attaching a job to a worker account.
      const creator = await User.findById(req.body.creatorId);
      if (!creator) return res.status(400).json({ success: false, message: 'That creator account does not exist.' });
      if (creator.role !== 'job_creator') {
        return res.status(400).json({ success: false, message: 'A job can only be owned by a Job Creator account.' });
      }
      updates.creatorId = creator._id;
    }

    if (req.body.payment !== undefined) {
      const payment = Number(req.body.payment);
      if (!Number.isFinite(payment) || payment < 0) {
        return res.status(400).json({ success: false, message: 'Payment must be zero or a positive number.' });
      }
      updates.payment = Math.round(payment * 100) / 100;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No editable fields were supplied.' });
    }

    const before = {
      title: job.title,
      category: job.category,
      creatorId: String(job.creatorId),
      payment: job.payment,
    };

    Object.assign(job, updates);
    await job.save();

    await audit.record({
      req,
      user: req.user,
      action: 'job.update',
      module: 'jobs',
      recordId: String(job._id),
      recordLabel: job.title,
      before,
      after: updates,
      message: `Updated: ${Object.keys(updates).join(', ')}.`,
    });

    // Populate the creator so the admin table can keep rendering the name
    // without a second round-trip.
    await job.populate('creatorId', 'name businessName mobile');
    res.json({ success: true, message: 'Job updated.', job });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') || 'Invalid job data.' });
    }
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
  updateUser,
  toggleBlockUser,
  verifyUser,
  listAllJobs,
  updateJob,
  removeJob,
  listReports,
  updateReportStatus,
  ASSIGNABLE_ROLES,
};
