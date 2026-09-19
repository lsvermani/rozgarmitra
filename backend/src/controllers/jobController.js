const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const { distanceKm } = require('../utils/geo');
const { notify } = require('../services/notificationService');

// POST /api/jobs  (job_creator only)
async function createJob(req, res, next) {
  try {
    const {
      title,
      description,
      category,
      requiredSkills,
      workersRequired,
      date,
      startTime,
      endTime,
      duration,
      payment,
      paymentUnit,
      location,
    } = req.body;

    const job = await Job.create({
      creatorId: req.user._id,
      title,
      description,
      category,
      requiredSkills: requiredSkills || [],
      workersRequired: workersRequired || 1,
      date,
      startTime,
      endTime,
      duration,
      payment,
      paymentUnit,
      location,
    });

    res.status(201).json({ success: true, message: 'Job posted successfully.', job });
  } catch (err) {
    next(err);
  }
}

// GET /api/jobs
// query: category, skill, lat, lng, maxDistanceKm, minPayment, maxPayment, date, search, page, limit
async function listJobs(req, res, next) {
  try {
    const {
      category,
      skill,
      lat,
      lng,
      maxDistanceKm,
      minPayment,
      maxPayment,
      date,
      search,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};
    if (category) query.category = category;
    if (skill) query.requiredSkills = skill;
    if (status) query.status = status;
    else query.status = { $nin: ['CANCELLED'] };

    if (minPayment || maxPayment) {
      query.payment = {};
      if (minPayment) query.payment.$gte = Number(minPayment);
      if (maxPayment) query.payment.$lte = Number(maxPayment);
    }

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    let jobs = await Job.find(query)
      .populate('creatorId', 'name businessName rating verified profilePhoto')
      .sort({ createdAt: -1 })
      .lean();

    // Distance filter/annotation (in-memory, fine for MVP scale)
    if (lat && lng) {
      const userLat = Number(lat);
      const userLng = Number(lng);
      jobs = jobs
        .map((job) => ({
          ...job,
          distanceKm: distanceKm(userLat, userLng, job.location?.latitude, job.location?.longitude),
        }))
        .filter((job) => {
          if (!maxDistanceKm) return true;
          return job.distanceKm === null || job.distanceKm <= Number(maxDistanceKm);
        })
        .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Number(limit));
    const start = (pageNum - 1) * limitNum;
    let paginated = jobs.slice(start, start + limitNum);

    if (req.user?.role === 'worker' && paginated.length > 0) {
      const applications = await Application.find({
        workerId: req.user._id,
        jobId: { $in: paginated.map((job) => job._id) },
      }).select('jobId status');
      const applicationsByJob = new Map(applications.map((application) => [application.jobId.toString(), application]));
      paginated = paginated.map((job) => ({
        ...job,
        myApplication: applicationsByJob.get(job._id.toString()) || null,
      }));
    }

    res.json({
      success: true,
      count: paginated.length,
      total: jobs.length,
      page: pageNum,
      jobs: paginated,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/jobs/:id
async function getJob(req, res, next) {
  try {
    const job = await Job.findById(req.params.id).populate(
      'creatorId',
      'name businessName rating ratingCount verified profilePhoto location.city'
    );
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    let myApplication = null;
    if (req.user && req.user.role === 'worker') {
      myApplication = await Application.findOne({ jobId: job._id, workerId: req.user._id });
    }

    res.json({ success: true, job, myApplication });
  } catch (err) {
    next(err);
  }
}

// PUT /api/jobs/:id  (creator only, own job)
async function updateJob(req, res, next) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.creatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only edit your own jobs.' });
    }

    const allowedFields = [
      'title',
      'description',
      'category',
      'requiredSkills',
      'workersRequired',
      'date',
      'startTime',
      'endTime',
      'duration',
      'payment',
      'paymentUnit',
      'location',
      'status',
    ];
    allowedFields.forEach((f) => {
      if (req.body[f] !== undefined) job[f] = req.body[f];
    });

    await job.save();
    res.json({ success: true, message: 'Job updated.', job });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/jobs/:id (creator only, own job)
async function deleteJob(req, res, next) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.creatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only delete your own jobs.' });
    }
    await job.deleteOne();
    await Application.deleteMany({ jobId: job._id });
    res.json({ success: true, message: 'Job removed.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/jobs/:id/apply  (worker only)
async function applyToJob(req, res, next) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (!['POSTED', 'APPLICATIONS_RECEIVED'].includes(job.status)) {
      return res.status(400).json({ success: false, message: 'This job is no longer accepting applications.' });
    }

    const existing = await Application.findOne({ jobId: job._id, workerId: req.user._id });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already applied to this job.' });
    }

    const application = await Application.create({ jobId: job._id, workerId: req.user._id });

    job.applicationsCount += 1;
    if (job.status === 'POSTED') job.status = 'APPLICATIONS_RECEIVED';
    await job.save();

    await notify(
      job.creatorId,
      'New application received',
      `A new worker has applied for "${job.title}".`,
      'NEW_APPLICATION',
      job._id
    );

    res.status(201).json({ success: true, message: 'Application submitted.', application });
  } catch (err) {
    next(err);
  }
}

// POST /api/jobs/:id/complete (creator marks job completed)
async function completeJob(req, res, next) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    if (job.creatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only complete your own jobs.' });
    }

    job.status = 'COMPLETED';
    await job.save();

    const selectedApps = await Application.find({ jobId: job._id, status: 'SELECTED' });
    await Application.updateMany({ jobId: job._id, status: 'SELECTED' }, { status: 'COMPLETED' });

    await Promise.all(
      selectedApps.map(async (app) => {
        await User.findByIdAndUpdate(app.workerId, { $inc: { completedJobs: 1 } });
        await notify(
          app.workerId,
          'Job marked completed',
          `"${job.title}" has been marked completed. Please rate the job creator.`,
          'JOB_COMPLETED',
          job._id
        );
      })
    );

    res.json({ success: true, message: 'Job marked as completed.', job });
  } catch (err) {
    next(err);
  }
}

module.exports = { createJob, listJobs, getJob, updateJob, deleteJob, applyToJob, completeJob };
