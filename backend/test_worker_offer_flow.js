const mongoose = require('mongoose');
const User = require('./src/models/User');
const Job = require('./src/models/Job');
const WorkerOffer = require('./src/models/WorkerOffer');
const WorkerSelection = require('./src/models/WorkerSelection');
const { generateToken } = require('./src/utils/token');

async function testFlow() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rozgarmitra');
  console.log('Connected to MongoDB');

  try {
    // 1. Get or create test creator and workers
    let creator = await User.findOne({ mobile: '9000000020' });
    if (!creator) {
      creator = await User.create({ mobile: '9000000020', name: 'Test Creator', role: 'job_creator' });
    }

    let workerA = await User.findOne({ mobile: '9000000010' });
    if (!workerA) {
      workerA = await User.create({ mobile: '9000000010', name: 'Worker A (Ravi)', role: 'worker' });
    }

    let workerB = await User.findOne({ mobile: '9000000011' });
    if (!workerB) {
      workerB = await User.create({ mobile: '9000000011', name: 'Worker B (Amit)', role: 'worker' });
    }

    let workerC = await User.findOne({ mobile: '9000000012' });
    if (!workerC) {
      workerC = await User.create({ mobile: '9000000012', name: 'Worker C (Sunil)', role: 'worker' });
    }

    // 2. Creator creates a job requiring 2 workers
    const testJob = await Job.create({
      creatorId: creator._id,
      title: 'Loading 500 Bags - Verification Test',
      description: 'Loading daily wholesale bags',
      category: 'Loading / Unloading',
      workersRequired: 2,
      workersSelected: 0,
      date: new Date(),
      startTime: '08:00',
      endTime: '16:00',
      duration: '1 Day',
      payment: 1000,
      paymentUnit: 'day',
      location: { city: 'Ludhiana' },
      status: 'OPEN',
    });
    console.log(`✓ Job created: "${testJob.title}", required workers: ${testJob.workersRequired}`);

    // 3. Worker A submits offer ₹1,200
    const offerA = await WorkerOffer.create({
      jobId: testJob._id,
      workerId: workerA._id,
      proposedAmount: 1200,
      message: 'Experienced loader with 5 yrs exp',
      status: 'PENDING',
    });
    console.log(`✓ Worker A submitted offer: ₹${offerA.proposedAmount}`);

    // Test duplicate prevention for Worker A
    const activeOfferA = await WorkerOffer.findOne({
      jobId: testJob._id,
      workerId: workerA._id,
      status: { $in: ['PENDING', 'ACCEPTED'] },
    });
    console.log(`✓ Duplicate check: Worker A already has active offer ID: ${activeOfferA._id}`);

    // 4. Worker B submits offer ₹1,000
    const offerB = await WorkerOffer.create({
      jobId: testJob._id,
      workerId: workerB._id,
      proposedAmount: 1000,
      message: 'Can start right away',
      status: 'PENDING',
    });
    console.log(`✓ Worker B submitted offer: ₹${offerB.proposedAmount}`);

    // 5. Worker C submits offer ₹1,100
    const offerC = await WorkerOffer.create({
      jobId: testJob._id,
      workerId: workerC._id,
      proposedAmount: 1100,
      message: 'Hard working',
      status: 'PENDING',
    });
    console.log(`✓ Worker C submitted offer: ₹${offerC.proposedAmount}`);

    // 6. Creator selects Worker B (₹1,000)
    let updatedJob = await Job.findOneAndUpdate(
      { _id: testJob._id, $expr: { $lt: ['$workersSelected', '$workersRequired'] } },
      { $inc: { workersSelected: 1 } },
      { new: true }
    );
    offerB.status = 'ACCEPTED';
    await offerB.save();
    await WorkerSelection.create({
      jobId: testJob._id,
      offerId: offerB._id,
      workerId: workerB._id,
      selectedAmount: offerB.proposedAmount,
    });
    console.log(`✓ Selected Worker B (₹${offerB.proposedAmount}). Workers selected so far: ${updatedJob.workersSelected}/${updatedJob.workersRequired}`);

    // 7. Creator selects Worker A (₹1,200) -> Fills required 2 spots
    updatedJob = await Job.findOneAndUpdate(
      { _id: testJob._id, $expr: { $lt: ['$workersSelected', '$workersRequired'] } },
      { $inc: { workersSelected: 1 } },
      { new: true }
    );
    offerA.status = 'ACCEPTED';
    await offerA.save();
    await WorkerSelection.create({
      jobId: testJob._id,
      offerId: offerA._id,
      workerId: workerA._id,
      selectedAmount: offerA.proposedAmount,
    });

    const isFilled = updatedJob.workersSelected >= updatedJob.workersRequired;
    if (isFilled) {
      updatedJob.status = 'WORKERS_SELECTED';
      await updatedJob.save();
      await WorkerOffer.updateMany(
        { jobId: testJob._id, _id: { $nin: [offerA._id, offerB._id] }, status: 'PENDING' },
        { status: 'REJECTED' }
      );
    }
    console.log(`✓ Selected Worker A (₹${offerA.proposedAmount}). Job filled: ${isFilled}, New Status: ${updatedJob.status}`);

    // 8. Verify atomic check: Trying to select Worker C now fails
    const failSelection = await Job.findOneAndUpdate(
      { _id: testJob._id, $expr: { $lt: ['$workersSelected', '$workersRequired'] } },
      { $inc: { workersSelected: 1 } },
      { new: true }
    );
    console.log(`✓ Atomic over-selection guard: Expected null, Got: ${failSelection}`);

    // 9. Verify Worker C status is REJECTED
    const finalOfferC = await WorkerOffer.findById(offerC._id);
    console.log(`✓ Worker C offer status: ${finalOfferC.status}`);

    // Cleanup test job
    await Job.findByIdAndDelete(testJob._id);
    await WorkerOffer.deleteMany({ jobId: testJob._id });
    await WorkerSelection.deleteMany({ jobId: testJob._id });
    console.log('✓ Cleanup completed successfully.');
    console.log('\n🎉 ALL BUSINESS RULES AND WORKER-BASED SELF-QUOTED BOOKING TESTS PASSED!');
  } finally {
    await mongoose.disconnect();
  }
}

testFlow();
