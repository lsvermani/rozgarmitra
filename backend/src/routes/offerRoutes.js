const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  submitOffer,
  editOffer,
  withdrawOffer,
  getMyOffers,
  getJobOffers,
  selectWorkerOffer,
  rejectWorkerOffer,
} = require('../controllers/offerController');

const router = express.Router();

// Worker routes
router.post('/jobs/:jobId', protect, authorize('worker'), submitOffer);
router.put('/:id', protect, authorize('worker'), editOffer);
router.put('/:id/withdraw', protect, authorize('worker'), withdrawOffer);
router.get('/my', protect, authorize('worker'), getMyOffers);

// Creator routes
router.get('/job/:jobId', protect, authorize('job_creator', 'admin'), getJobOffers);
router.post('/:id/select', protect, authorize('job_creator'), selectWorkerOffer);
router.post('/:id/reject', protect, authorize('job_creator'), rejectWorkerOffer);

module.exports = router;
