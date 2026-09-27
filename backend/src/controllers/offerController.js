const WorkerOffer = require('../models/WorkerOffer');
const WorkerSelection = require('../models/WorkerSelection');
const Job = require('../models/Job');
const User = require('../models/User');
const Rating = require('../models/Rating');
const { notify } = require('../services/notificationService');

// POST /api/offers/jobs/:jobId
// Worker submits or updates an offer with self-quoted amount
async function submitOffer(req, res, next) {
  try {
    const { jobId } = req.params;
    const { proposedAmount, message, availabilityConfirmation } = req.body;

    if (!proposedAmount || Number(proposedAmount) <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid proposed amount.' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    // Check job status
    const openStatuses = ['OPEN', 'OFFERS_RECEIVED', 'POSTED', 'APPLICATIONS_RECEIVED'];
    if (!openStatuses.includes(job.status)) {
      return res.status(400).json({
        success: false,
        message: 'This job is no longer accepting offers. Current status: ' + job.status,
      });
    }

    // Check if worker already has an active offer
    let offer = await WorkerOffer.findOne({
      jobId: job._id,
      workerId: req.user._id,
      status: { $in: ['PENDING', 'ACCEPTED'] },
    });

    if (offer) {
      return res.status(409).json({
        success: false,
        message: 'You have already submitted an active offer for this job.',
        offer,
      });
    }

    // Create new offer
    offer = await WorkerOffer.create({
      jobId: job._id,
      workerId: req.user._id,
      proposedAmount: Number(proposedAmount),
      message: message || '',
      availabilityConfirmation: availabilityConfirmation !== false,
      status: 'PENDING',
    });

    // Update job offersCount and status atomically
    const newJobStatus = (job.status === 'OPEN' || job.status === 'POSTED') ? 'OFFERS_RECEIVED' : job.status;
    await Job.findByIdAndUpdate(job._id, {
      $inc: { offersCount: 1, applicationsCount: 1 },
      $set: { status: newJobStatus },
    });

    // Notify creator
    await notify(
      job.creatorId,
      'New Worker Offer',
      `${req.user.name || 'A worker'} has submitted an offer of ₹${proposedAmount} for "${job.title}".`,
      'NEW_OFFER',
      job._id
    );

    res.status(201).json({
      success: true,
      message: 'Offer submitted successfully!',
      offer,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/offers/:id
// Worker edits their pending offer
async function editOffer(req, res, next) {
  try {
    const { proposedAmount, message, availabilityConfirmation } = req.body;
    const offer = await WorkerOffer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found.' });
    }

    if (offer.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this offer.' });
    }

    if (offer.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot edit an offer that is already ${offer.status.toLowerCase()}.`,
      });
    }

    if (proposedAmount !== undefined) {
      if (Number(proposedAmount) <= 0) {
        return res.status(400).json({ success: false, message: 'Proposed amount must be greater than zero.' });
      }
      offer.proposedAmount = Number(proposedAmount);
    }
    if (message !== undefined) offer.message = message;
    if (availabilityConfirmation !== undefined) offer.availabilityConfirmation = availabilityConfirmation;

    await offer.save();

    res.json({ success: true, message: 'Offer updated successfully.', offer });
  } catch (err) {
    next(err);
  }
}

// PUT /api/offers/:id/withdraw
// Worker withdraws their pending offer
async function withdrawOffer(req, res, next) {
  try {
    const offer = await WorkerOffer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found.' });
    }

    if (offer.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to withdraw this offer.' });
    }

    if (offer.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Only PENDING offers can be withdrawn. Current status: ${offer.status}`,
      });
    }

    offer.status = 'WITHDRAWN';
    await offer.save();

    // Decrement offersCount on Job
    await Job.findByIdAndUpdate(offer.jobId, { $inc: { offersCount: -1 } });

    res.json({ success: true, message: 'Offer withdrawn successfully.', offer });
  } catch (err) {
    next(err);
  }
}

// GET /api/offers/my
// Worker lists all their offers
async function getMyOffers(req, res, next) {
  try {
    const offers = await WorkerOffer.find({ workerId: req.user._id })
      .populate({
        path: 'jobId',
        select: 'title description category location date startTime endTime duration payment paymentUnit workersRequired workersSelected status creatorId',
        populate: { path: 'creatorId', select: 'name businessName mobile location' },
      })
      .sort({ createdAt: -1 });

    // Enrich with contact details if selected/accepted
    const enriched = offers.map((off) => {
      const plain = off.toObject();
      const job = plain.jobId;
      const isAccepted = off.status === 'ACCEPTED';
      return {
        ...plain,
        contactDetails: isAccepted && job?.creatorId ? {
          creator: {
            name: job.creatorId.businessName || job.creatorId.name,
            mobile: job.creatorId.mobile,
            location: job.creatorId.location,
          },
        } : null,
      };
    });

    res.json({ success: true, count: enriched.length, offers: enriched });
  } catch (err) {
    next(err);
  }
}

// GET /api/offers/job/:jobId
// Creator views all offers for a specific job they posted
async function getJobOffers(req, res, next) {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    if (req.user.role !== 'admin' && job.creatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view offers for this job.' });
    }

    const offers = await WorkerOffer.find({ jobId })
      .populate('workerId', 'name mobile profilePhoto skills categories rating ratingCount experienceYears totalJobs completedJobs verified location createdAt')
      .sort({ createdAt: -1 });

    const workerIds = offers.map((o) => o.workerId?._id).filter(Boolean);

    // Fetch past jobs & ratings for rich worker profile in dashboard
    const [pastSelections, ratings] = await Promise.all([
      WorkerSelection.find({ workerId: { $in: workerIds } })
        .populate('jobId', 'title category date status location')
        .sort({ updatedAt: -1 }),
      Rating.find({ toUserId: { $in: workerIds } })
        .populate('fromUserId', 'name businessName role')
        .populate('jobId', 'title category')
        .sort({ createdAt: -1 }),
    ]);

    const historyByWorker = new Map();
    for (const item of pastSelections) {
      const key = item.workerId.toString();
      if (!historyByWorker.has(key)) historyByWorker.set(key, []);
      if (item.jobId) historyByWorker.get(key).push(item.jobId);
    }

    const ratingsByWorker = new Map();
    for (const r of ratings) {
      const key = r.toUserId.toString();
      if (!ratingsByWorker.has(key)) ratingsByWorker.set(key, []);
      ratingsByWorker.get(key).push(r);
    }

    const enrichedOffers = offers.map((off) => {
      const plain = off.toObject();
      const worker = plain.workerId;
      const workerId = worker?._id?.toString();
      const isAccepted = off.status === 'ACCEPTED';

      return {
        ...plain,
        workerProfile: worker ? {
          memberSince: worker.createdAt,
          tasksTaken: worker.totalJobs || (historyByWorker.get(workerId) || []).length,
          completedWork: (historyByWorker.get(workerId) || []).slice(0, 5),
          ratings: (ratingsByWorker.get(workerId) || []).slice(0, 5),
        } : null,
        contactDetails: isAccepted && worker ? {
          name: worker.name,
          mobile: worker.mobile,
          location: worker.location,
        } : null,
      };
    });

    res.json({
      success: true,
      job,
      count: enrichedOffers.length,
      offers: enrichedOffers,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/offers/:id/select
// Job creator accepts an offer and selects the worker
// Enforces atomic check so selections do not exceed required_workers
async function selectWorkerOffer(req, res, next) {
  try {
    const offer = await WorkerOffer.findById(req.params.id).populate('jobId').populate('workerId');

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found.' });
    }

    const job = offer.jobId;
    if (job.creatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this job.' });
    }

    if (offer.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Only PENDING offers can be accepted. This offer is ${offer.status}.`,
      });
    }

    // Atomic update to ensure workersSelected < workersRequired
    const updatedJob = await Job.findOneAndUpdate(
      {
        _id: job._id,
        $expr: { $lt: ['$workersSelected', '$workersRequired'] },
      },
      {
        $inc: { workersSelected: 1 },
      },
      { new: true }
    );

    if (!updatedJob) {
      return res.status(400).json({
        success: false,
        message: 'All required worker positions for this job are already filled.',
      });
    }

    // Mark this offer as ACCEPTED
    offer.status = 'ACCEPTED';
    await offer.save();

    // Create selection record
    const selection = await WorkerSelection.create({
      jobId: job._id,
      offerId: offer._id,
      workerId: offer.workerId._id,
      selectedAmount: offer.proposedAmount,
      status: 'SELECTED',
    });

    // Check if required number of workers reached
    const isNowFilled = updatedJob.workersSelected >= updatedJob.workersRequired;
    if (isNowFilled) {
      updatedJob.status = 'WORKERS_SELECTED';
      await updatedJob.save();

      // Automatically reject or mark NOT SELECTED for remaining pending offers
      const otherOffers = await WorkerOffer.find({
        jobId: job._id,
        _id: { $ne: offer._id },
        status: 'PENDING',
      });

      if (otherOffers.length > 0) {
        await WorkerOffer.updateMany(
          { jobId: job._id, _id: { $ne: offer._id }, status: 'PENDING' },
          { status: 'REJECTED' }
        );

        // Notify other workers they were not selected
        for (const other of otherOffers) {
          await notify(
            other.workerId,
            'Job Positions Filled',
            `All worker spots for "${job.title}" have been filled. Your offer was not selected this time.`,
            'OFFER_NOT_SELECTED',
            job._id
          );
        }
      }
    }

    // Notify selected worker
    await notify(
      offer.workerId._id,
      '🎉 Offer Accepted & Selected!',
      `Congratulations! The job creator accepted your offer of ₹${offer.proposedAmount} for "${job.title}".`,
      'OFFER_ACCEPTED',
      job._id
    );

    res.json({
      success: true,
      message: 'Worker selected successfully.',
      offer,
      selection,
      job: updatedJob,
      isFilled: isNowFilled,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/offers/:id/reject
// Job creator explicitly rejects a worker offer
async function rejectWorkerOffer(req, res, next) {
  try {
    const offer = await WorkerOffer.findById(req.params.id).populate('jobId');

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found.' });
    }

    const job = offer.jobId;
    if (job.creatorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this job.' });
    }

    if (offer.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Only PENDING offers can be rejected. This offer is ${offer.status}.`,
      });
    }

    offer.status = 'REJECTED';
    await offer.save();

    await notify(
      offer.workerId,
      'Offer Status Update',
      `Your offer for "${job.title}" was not accepted by the job creator.`,
      'OFFER_REJECTED',
      job._id
    );

    res.json({ success: true, message: 'Offer rejected.', offer });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitOffer,
  editOffer,
  withdrawOffer,
  getMyOffers,
  getJobOffers,
  selectWorkerOffer,
  rejectWorkerOffer,
};
