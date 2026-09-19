/**
 * Seeds the database with demo data so the app can be shown immediately:
 * - 1 admin
 * - 10 workers
 * - 5 job creators
 * - 20 jobs
 * - ~30 applications
 * - ratings
 * - notifications
 * - reports
 * - default categories
 *
 * Run with: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Rating = require('../models/Rating');
const Notification = require('../models/Notification');
const Report = require('../models/Report');
const Category = require('../models/Category');

const CATEGORIES = [
  { name: 'Construction', icon: '🧱', subCategories: ['Construction Helper', 'Mason', 'Painter', 'Carpenter', 'Plumber', 'Labour'] },
  { name: 'Household', icon: '🏠', subCategories: ['Cleaning', 'Gardening', 'Cooking Helper', 'Shifting Helper'] },
  { name: 'Shops & Businesses', icon: '🏬', subCategories: ['Shop Helper', 'Warehouse Helper', 'Loading/Unloading', 'Delivery Helper'] },
  { name: 'Events', icon: '🎪', subCategories: ['Catering Helper', 'Decoration Helper', 'Tent Helper', 'Event Cleaning'] },
];

// Rough coordinates around Delhi-NCR so distance filters have something to work with.
const BASE_LAT = 28.6139;
const BASE_LNG = 77.209;
const jitter = () => (Math.random() - 0.5) * 0.2; // ~±11km

const WORKER_NAMES = ['Ramesh', 'Suresh', 'Amit', 'Raj Kumar', 'Mohan', 'Sanjay', 'Vijay', 'Deepak', 'Anil', 'Pankaj'];
const WORKER_SKILLS = [
  ['Construction', 'Loading', 'Physical Labour'],
  ['Painting', 'Carpentry'],
  ['Cleaning', 'Gardening'],
  ['Cooking Helper', 'Shifting Helper'],
  ['Warehouse Helper', 'Delivery Helper'],
];

const CREATOR_NAMES = ['ABC Construction', 'Green Homes Services', 'Sharma Caterers', 'Metro Warehouse Pvt Ltd', 'Singh Event Solutions'];

const JOB_TITLES = [
  { title: 'Construction Helper', category: 'Construction', skills: ['Construction', 'Loading', 'Physical Labour'] },
  { title: 'Mason Required', category: 'Construction', skills: ['Mason', 'Construction'] },
  { title: 'Painter Needed', category: 'Construction', skills: ['Painting'] },
  { title: 'House Cleaning', category: 'Household', skills: ['Cleaning'] },
  { title: 'Gardener Needed', category: 'Household', skills: ['Gardening'] },
  { title: 'Cooking Helper for Event', category: 'Events', skills: ['Cooking Helper', 'Catering Helper'] },
  { title: 'Warehouse Helper', category: 'Shops & Businesses', skills: ['Warehouse Helper'] },
  { title: 'Loading/Unloading Worker', category: 'Shops & Businesses', skills: ['Loading/Unloading'] },
  { title: 'Delivery Helper', category: 'Shops & Businesses', skills: ['Delivery Helper'] },
  { title: 'Event Decoration Helper', category: 'Events', skills: ['Decoration Helper'] },
  { title: 'Tent Setup Helper', category: 'Events', skills: ['Tent Helper'] },
  { title: 'Shifting Helper (House Move)', category: 'Household', skills: ['Shifting Helper'] },
  { title: 'Shop Helper', category: 'Shops & Businesses', skills: ['Shop Helper'] },
  { title: 'Carpenter Needed', category: 'Construction', skills: ['Carpenter'] },
  { title: 'Plumber Required', category: 'Construction', skills: ['Plumber'] },
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomDateWithinDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(Math.random() * days));
  d.setHours(0, 0, 0, 0);
  return d;
}

async function seed() {
  await connectDB();

  console.log('🗑  Clearing existing demo collections...');
  await Promise.all([
    User.deleteMany({}),
    Job.deleteMany({}),
    Application.deleteMany({}),
    Rating.deleteMany({}),
    Notification.deleteMany({}),
    Report.deleteMany({}),
    Category.deleteMany({}),
  ]);

  console.log('📂 Creating categories...');
  await Category.insertMany(CATEGORIES);

  console.log('👤 Creating admin...');
  const admin = await User.create({
    name: process.env.ADMIN_NAME || 'Super Admin',
    mobile: process.env.ADMIN_MOBILE || '9999999999',
    role: 'admin',
    verified: true,
  });

  console.log('👷 Creating workers...');
  const workers = [];
  for (let i = 0; i < 10; i++) {
    const skills = WORKER_SKILLS[i % WORKER_SKILLS.length];
    const w = await User.create({
      name: WORKER_NAMES[i],
      mobile: `90000000${String(i + 10).slice(-2)}`,
      role: 'worker',
      skills,
      categories: [...new Set(skills.map((s) => CATEGORIES.find((c) => c.subCategories.includes(s))?.name).filter(Boolean))],
      experienceYears: Math.floor(Math.random() * 8) + 1,
      availability: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      location: {
        address: `Sector ${i + 1}, Demo Colony`,
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        latitude: BASE_LAT + jitter(),
        longitude: BASE_LNG + jitter(),
      },
      rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      ratingCount: Math.floor(Math.random() * 15) + 1,
      completedJobs: Math.floor(Math.random() * 30),
      verified: Math.random() > 0.3,
    });
    workers.push(w);
  }

  console.log('🏢 Creating job creators...');
  const creators = [];
  for (let i = 0; i < 5; i++) {
    const c = await User.create({
      name: CREATOR_NAMES[i].split(' ')[0],
      businessName: CREATOR_NAMES[i],
      mobile: `80000000${String(i + 10).slice(-2)}`,
      role: 'job_creator',
      location: {
        address: `Industrial Area Phase ${i + 1}`,
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110020',
        latitude: BASE_LAT + jitter(),
        longitude: BASE_LNG + jitter(),
      },
      rating: Math.round((3.8 + Math.random() * 1.2) * 10) / 10,
      ratingCount: Math.floor(Math.random() * 20) + 1,
      verified: Math.random() > 0.2,
    });
    creators.push(c);
  }

  console.log('📋 Creating jobs...');
  const jobs = [];
  for (let i = 0; i < 20; i++) {
    const template = JOB_TITLES[i % JOB_TITLES.length];
    const creator = randomFrom(creators);
    const status = randomFrom(['POSTED', 'POSTED', 'APPLICATIONS_RECEIVED', 'APPLICATIONS_RECEIVED', 'WORKER_SELECTED', 'COMPLETED']);
    const job = await Job.create({
      creatorId: creator._id,
      title: template.title,
      description: `${template.title} required. Punctual and hardworking candidates preferred. Basic tools will be provided on site.`,
      category: template.category,
      requiredSkills: template.skills,
      workersRequired: Math.floor(Math.random() * 3) + 1,
      date: randomDateWithinDays(10),
      startTime: '09:00',
      endTime: '17:00',
      duration: '1 Day',
      payment: [400, 500, 600, 700, 800, 900, 1000][Math.floor(Math.random() * 7)],
      paymentUnit: 'day',
      location: {
        address: `Near ${creator.businessName}`,
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110020',
        latitude: BASE_LAT + jitter(),
        longitude: BASE_LNG + jitter(),
      },
      status,
    });
    jobs.push(job);
  }

  console.log('📝 Creating applications...');
  const applications = [];
  let applicationCount = 0;
  for (const job of jobs) {
    const numApplicants = Math.floor(Math.random() * 3) + 1;
    const shuffledWorkers = [...workers].sort(() => Math.random() - 0.5).slice(0, numApplicants);
    for (const worker of shuffledWorkers) {
      if (applicationCount >= 30) break;
      let status = 'APPLIED';
      if (job.status === 'WORKER_SELECTED' || job.status === 'COMPLETED') {
        status = randomFrom(['SELECTED', 'SHORTLISTED', 'REJECTED']);
      } else if (job.status === 'APPLICATIONS_RECEIVED') {
        status = randomFrom(['APPLIED', 'SHORTLISTED']);
      }
      try {
        const app = await Application.create({
          jobId: job._id,
          workerId: worker._id,
          status,
        });
        applications.push(app);
        applicationCount++;
        job.applicationsCount += 1;
      } catch (e) {
        // duplicate application (unique index) - skip
      }
    }
    await job.save();
  }

  console.log('⭐ Creating ratings for completed jobs...');
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED');
  for (const job of completedJobs) {
    const app = applications.find((a) => a.jobId.toString() === job._id.toString() && a.status === 'SELECTED');
    if (!app) continue;
    const worker = workers.find((w) => w._id.toString() === app.workerId.toString());
    const creator = creators.find((c) => c._id.toString() === job.creatorId.toString());
    if (!worker || !creator) continue;

    await Rating.create({
      jobId: job._id,
      fromUserId: creator._id,
      toUserId: worker._id,
      rating: Math.floor(Math.random() * 2) + 4,
      comment: 'Good work, on time.',
    });
    await Rating.create({
      jobId: job._id,
      fromUserId: worker._id,
      toUserId: creator._id,
      rating: Math.floor(Math.random() * 2) + 4,
      comment: 'Fair payment, clear instructions.',
    });
  }

  console.log('🔔 Creating notifications...');
  for (const worker of workers) {
    await Notification.create({
      userId: worker._id,
      title: 'New job available near you',
      message: 'A new Construction Helper job was posted near your location.',
      type: 'NEW_JOB_NEARBY',
    });
  }
  for (const creator of creators) {
    await Notification.create({
      userId: creator._id,
      title: 'New application received',
      message: 'A worker applied for one of your jobs.',
      type: 'NEW_APPLICATION',
    });
  }

  console.log('🚩 Creating reports...');
  await Report.insertMany([
    {
      reporterId: workers[0]._id,
      reportedUserId: creators[0]._id,
      jobId: jobs[0]._id,
      reason: 'Payment issue',
      description: 'Payment amount did not match the amount shown in the job listing.',
      status: 'OPEN',
    },
    {
      reporterId: creators[1]._id,
      reportedUserId: workers[1]._id,
      jobId: jobs[1]._id,
      reason: 'Wrong information',
      description: 'The worker profile skills did not match the submitted application.',
      status: 'REVIEWING',
    },
    {
      reporterId: workers[2]._id,
      reportedUserId: creators[2]._id,
      reason: 'Other',
      description: 'The job location was different from the location in the listing.',
      status: 'RESOLVED',
    },
  ]);

  console.log('\n✅ Seed complete!\n');
  console.log('Demo login (any of these mobiles, OTP = ' + (process.env.DEMO_OTP || '123456') + '):');
  console.log(`  Admin:        ${admin.mobile}`);
  console.log(`  Worker:       ${workers[0].mobile} (${workers[0].name})`);
  console.log(`  Job Creator:  ${creators[0].mobile} (${creators[0].businessName})`);
  console.log(`\nTotals: ${workers.length} workers, ${creators.length} creators, ${jobs.length} jobs, ${applications.length} applications, 3 reports\n`);

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
