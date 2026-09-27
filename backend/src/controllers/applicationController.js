const Application = require('../models/Application');
const Job = require('../models/Job');
const Rating = require('../models/Rating');
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
      .populate('jobId', 'title category date payment status location creatorId')
      .populate({ path: 'jobId.creatorId', select: 'name businessName mobile location' })
      .populate('workerId', 'name mobile profilePhoto skills categories rating ratingCount experienceYears totalJobs completedJobs verified location createdAt')
      .sort({ createdAt: -1 });

    // A creator needs enough context to make a fair hiring decision. Keep the
    // contact details private until that creator confirms/selects the worker.
    if (req.user.role === 'job_creator' && applications.length) {
      const workerIds = applications.map((application) => application.workerId?._id).filter(Boolean);
      const [pastApplications, ratings] = await Promise.all([
        Application.find({ workerId: { $in: workerIds } })
          .populate('jobId', 'title category date status location.city')
          .sort({ updatedAt: -1 }),
        Rating.find({ toUserId: { $in: workerIds } })
          .populate('fromUserId', 'name businessName role')
          .populate('jobId', 'title category')
          .sort({ createdAt: -1 }),
      ]);

      const historyByWorker = new Map();
      for (const item of pastApplications) {
        if (!['COMPLETED', 'RATED'].includes(item.jobId?.status)) continue;
        const key = item.workerId.toString();
        if (!historyByWorker.has(key)) historyByWorker.set(key, []);
        historyByWorker.get(key).push(item.jobId);
      }
      const ratingsByWorker = new Map();
      for (const rating of ratings) {
        const key = rating.toUserId.toString();
        if (!ratingsByWorker.has(key)) ratingsByWorker.set(key, []);
        ratingsByWorker.get(key).push(rating);
      }

      const creatorContact = {
        name: req.user.businessName || req.user.name,
        mobile: req.user.mobile,
        location: req.user.location,
      };
      const enrichedApplications = applications.map((application) => {
        const plain = application.toObject();
        const worker = plain.workerId;
        const workerId = worker?._id?.toString();
        const isConfirmed = ['SELECTED', 'ACCEPTED', 'COMPLETED'].includes(plain.status);

        return {
          ...plain,
          workerProfile: worker ? {
            memberSince: worker.createdAt,
            tasksTaken: worker.totalJobs || (historyByWorker.get(workerId) || []).length,
            completedWork: (historyByWorker.get(workerId) || []).slice(0, 5),
            ratings: (ratingsByWorker.get(workerId) || []).slice(0, 5),
          } : null,
          contactDetails: isConfirmed && worker ? {
            worker: { name: worker.name, mobile: worker.mobile, location: worker.location },
            creator: creatorContact,
          } : null,
        };
      });

      return res.json({ success: true, count: enrichedApplications.length, applications: enrichedApplications });
    }

    if (req.user.role === 'worker') {
      const workerContact = { name: req.user.name, mobile: req.user.mobile, location: req.user.location };
      const enrichedApplications = applications.map((application) => {
        const plain = application.toObject();
        const creator = plain.jobId?.creatorId;
        const isConfirmed = ['SELECTED', 'ACCEPTED', 'COMPLETED'].includes(plain.status);
        return {
          ...plain,
          contactDetails: isConfirmed && creator ? {
            worker: workerContact,
            creator: { name: creator.businessName || creator.name, mobile: creator.mobile, location: creator.location },
          } : null,
        };
      });
      return res.json({ success: true, count: enrichedApplications.length, applications: enrichedApplications });
    }

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

    const wasSelected = application.status === 'SELECTED';
    if (status === 'SELECTED' && !wasSelected && job.workersSelected >= job.workersRequired) {
      return res.status(400).json({ success: false, message: 'All worker positions for this task are already filled.' });
    }

    application.status = status;
    await application.save();

    if (status === 'SELECTED' && !wasSelected) {
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

// PUT /api/applications/:id/accept (worker only)
async function acceptApplication(req, res, next) {
  try {
    const application = await Application.findById(req.params.id).populate('jobId');
    if (!application) return res.status(404).json({ success: false, message: 'Application not found.' });
    if (application.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This application does not belong to you.' });
    }
    if (application.status !== 'SELECTED') {
      return res.status(400).json({ success: false, message: 'Only a selected task can be accepted.' });
    }

    application.status = 'ACCEPTED';
    await application.save();
    application.jobId.status = 'IN_PROGRESS';
    await application.jobId.save();

    await notify(
      application.jobId.creatorId,
      'Worker accepted the task',
      `The selected worker accepted "${application.jobId.title}" and is ready to start.`,
      'TASK_ACCEPTED',
      application.jobId._id
    );

    res.json({ success: true, message: 'Task accepted.', application });
  } catch (err) {
    next(err);
  }
}

module.exports = { listApplications, updateApplicationStatus, acceptApplication };
