const Application = require('../models/Application');
const Job = require('../models/Job');
const { notify } = require('../services/notificationService');

// GET /api/applications
// - worker: their own applications
// - job_creator: applications for their jobs (optionally filter by jobId)
async function listApplications(req, res, next) {
  try {
    let query = {};

    if (req.user.role === 'worker') {
      query.workerId = req.user._id;
    } else if (req.user.role === 'job_creator') {
      const jobFilter = { creatorId: req.user._id };
      if (req.query.jobId) jobFilter._id = req.query.jobId;
      const myJobs = await Job.find(jobFilter).select('_id');
      query.jobId = { $in: myJobs.map((j) => j._id) };
    }

    const applications = await Application.find(query)
      .populate('jobId', 'title category date payment status location.city')
      .populate('workerId', 'name profilePhoto skills rating ratingCount experienceYears verified')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: applications.length, applications });
  } catch (err) {
    next(err);
  }
}

// PUT /api/applications/:id/status  (job_creator only)
// body: { status: 'SHORTLISTED' | 'SELECTED' | 'REJECTED' }
async function updateApplicationStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ['SHORTLISTED', 'SELECTED', 'REJECTED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
    }

    const application = await Application.findById(req.params.id).populate('jobId');
    if (!application) return res.status(404).json({ success: false, message: 'Application not found.' });

    const job = application.jobId;
    if (job.creatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this job.' });
    }

    application.status = status;
    await application.save();

    if (status === 'SELECTED') {
      job.workersSelected += 1;
      if (job.workersSelected >= job.workersRequired) {
        job.status = 'WORKER_SELECTED';
      }
      await job.save();

      await notify(
        application.workerId,
        '🎉 Congratulations!',
        `You have been selected for "${job.title}".`,
        'APPLICATION_SELECTED',
        job._id
      );
    } else if (status === 'SHORTLISTED') {
      await notify(
        application.workerId,
        'Application shortlisted',
        `Your application for "${job.title}" was shortlisted.`,
        'APPLICATION_SHORTLISTED',
        job._id
      );
    } else if (status === 'REJECTED') {
      await notify(
        application.workerId,
        'Application update',
        `Your application for "${job.title}" was not selected this time.`,
        'APPLICATION_REJECTED',
        job._id
      );
    }

    res.json({ success: true, message: `Application ${status.toLowerCase()}.`, application });
  } catch (err) {
    next(err);
  }
}

module.exports = { listApplications, updateApplicationStatus };
