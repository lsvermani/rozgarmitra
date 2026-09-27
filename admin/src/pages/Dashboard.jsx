import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { adminApi, offersApi, jobsApi } from '../api/client';
import { useAuth } from '../context/useAuth';

const emptyTask = {
  title: '',
  description: '',
  category: 'Household',
  date: new Date().toISOString().slice(0, 10),
  startTime: '09:00',
  endTime: '17:00',
  payment: '',
  paymentUnit: 'day',
  location: '',
  workersRequired: '1',
};

function CreatorDashboard() {
  const [task, setTask] = useState(emptyTask);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Track offers map for all jobs: { [jobId]: offers[] }
  const [jobOffers, setJobOffers] = useState({});

  // Fetches tasks plus each task's offers. State is only written from promise
  // callbacks (never straight from an effect body) to avoid cascading renders.
  const fetchJobsAndOffers = () =>
    jobsApi
      .list({ limit: 50 })
      .then((jobsResponse) => {
        const fetchedJobs = jobsResponse.data.jobs || [];
        setJobs(fetchedJobs);
        // Fetch offers for each job
        return Promise.all(
          fetchedJobs.map((j) =>
            offersApi
              .getJobOffers(j._id)
              .then((offRes) => [j._id, offRes.data.offers || []])
              .catch(() => [j._id, []])
          )
        );
      })
      .then((entries) => setJobOffers(Object.fromEntries(entries)))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load your tasks.'));

  // Reload used after posting a task or acting on an offer — shows the spinner.
  const loadJobsAndOffers = async () => {
    setLoading(true);
    await fetchJobsAndOffers();
    setLoading(false);
  };

  useEffect(() => {
    // The initial `loading` state is already true, so the first load can run
    // without toggling state synchronously inside the effect.
    fetchJobsAndOffers().finally(() => setLoading(false));
  }, []);

  const update = (field, value) => setTask((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await jobsApi.create({
        ...task,
        payment: Number(task.payment),
        workersRequired: Number(task.workersRequired),
        location: { city: task.location },
      });
      setMessage(response.data.message || 'Task posted successfully.');
      setTask(emptyTask);
      loadJobsAndOffers();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post task.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectOffer = async (offer, job) => {
    const workerName = offer.workerId?.name || 'this worker';
    if (
      !window.confirm(
        `Select ${workerName} at their proposed amount of ₹${offer.proposedAmount} for "${job.title}"?`
      )
    ) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await offersApi.select(offer._id);
      setMessage(res.data.message || `Selected ${workerName}! Contact details are now available.`);
      await loadJobsAndOffers();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not select this worker.');
    } finally {
      setSaving(false);
    }
  };

  const handleRejectOffer = async (offer) => {
    const workerName = offer.workerId?.name || 'this worker';
    if (!window.confirm(`Reject offer of ₹${offer.proposedAmount} from ${workerName}?`)) return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await offersApi.reject(offer._id);
      setMessage(res.data.message || `Offer from ${workerName} rejected.`);
      await loadJobsAndOffers();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reject offer.');
    } finally {
      setSaving(false);
    }
  };

  const statusBadgeClass = (status) => {
    switch (status) {
      case 'ACCEPTED':
      case 'WORKERS_SELECTED':
        return 'rm-badge--green';
      case 'PENDING':
      case 'OPEN':
      case 'OFFERS_RECEIVED':
        return 'rm-badge--blue';
      case 'REJECTED':
      case 'CANCELLED':
        return 'rm-badge--red';
      default:
        return 'rm-badge--gray';
    }
  };

  return (
    <div>
      <div className="rm-creator-heading">
        <div>
          <span className="rm-eyebrow">JOB CREATOR PORTAL</span>
          <h2>Post Work & Review Worker Quotes</h2>
          <p>Workers decide their own price and submit offers. Select the best workers until required count is filled.</p>
        </div>
      </div>

      {message && <div className="rm-worker-alert rm-worker-alert--success">✅ {message}</div>}
      {error && <div className="rm-worker-alert rm-worker-alert--error">⚠️ {error}</div>}

      <div className="rm-creator-grid">
        {/* Post Work Form */}
        <form className="rm-card rm-creator-form" onSubmit={submit}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#0f766e' }}>➕ Post New Work</h3>

          <label>
            Task Title <span style={{ color: '#dc2626' }}>*</span>
            <input
              className="rm-input"
              value={task.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Loading 500 Bags / Construction Helper"
              required
            />
          </label>

          <label>
            Description & Requirements
            <textarea
              className="rm-input"
              value={task.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Explain the job, site location, tools provided or needed..."
              rows="3"
            />
          </label>

          <div className="rm-creator-form__row">
            <label>
              Category <span style={{ color: '#dc2626' }}>*</span>
              <select className="rm-select" value={task.category} onChange={(e) => update('category', e.target.value)}>
                <option>Household</option>
                <option>Construction</option>
                <option>Events</option>
                <option>Shops & Businesses</option>
                <option>Agriculture</option>
              </select>
            </label>
            <label>
              Required Workers <span style={{ color: '#dc2626' }}>*</span>
              <input
                className="rm-input"
                type="number"
                min="1"
                value={task.workersRequired}
                onChange={(e) => update('workersRequired', e.target.value)}
                required
              />
            </label>
          </div>

          <div className="rm-creator-form__row">
            <label>
              Work Date <span style={{ color: '#dc2626' }}>*</span>
              <input
                className="rm-input"
                type="date"
                value={task.date}
                onChange={(e) => update('date', e.target.value)}
                required
              />
            </label>
            <label>
              Location / City <span style={{ color: '#dc2626' }}>*</span>
              <input
                className="rm-input"
                value={task.location}
                onChange={(e) => update('location', e.target.value)}
                placeholder="e.g. Ludhiana, Clock Tower area"
                required
              />
            </label>
          </div>

          <div className="rm-creator-form__row">
            <label>
              Start Time
              <input
                className="rm-input"
                type="time"
                value={task.startTime}
                onChange={(e) => update('startTime', e.target.value)}
                required
              />
            </label>
            <label>
              End Time
              <input
                className="rm-input"
                type="time"
                value={task.endTime}
                onChange={(e) => update('endTime', e.target.value)}
                required
              />
            </label>
          </div>

          <div className="rm-creator-form__row">
            <label>
              Reference / Benchmark Payment (₹)
              <input
                className="rm-input"
                type="number"
                min="0"
                value={task.payment}
                onChange={(e) => update('payment', e.target.value)}
                placeholder="e.g. 1000"
                required
              />
            </label>
            <label>
              Payment Unit
              <select
                className="rm-select"
                value={task.paymentUnit}
                onChange={(e) => update('paymentUnit', e.target.value)}
              >
                <option value="day">Per day</option>
                <option value="hour">Per hour</option>
                <option value="task">Per task</option>
              </select>
            </label>
          </div>

          <button className="rm-btn rm-btn--primary" style={{ marginTop: '12px', height: '48px', fontWeight: 700 }} disabled={saving}>
            {saving ? 'Posting Job...' : '🚀 Post Job'}
          </button>
        </form>

        {/* Posted Jobs & Worker Offers Review List */}
        <section className="rm-card">
          <div className="rm-preview-section-heading">
            <div>
              <span className="rm-eyebrow">YOUR ACTIVE JOBS & OFFERS</span>
              <h3>Review Worker Quotes</h3>
            </div>
            <span className="rm-badge rm-badge--blue">{jobs.length} Jobs</span>
          </div>

          {loading ? (
            <div className="rm-loading">Loading your posted jobs...</div>
          ) : jobs.length === 0 ? (
            <div className="rm-empty">You haven't posted any jobs yet. Post a job above to receive worker offers!</div>
          ) : (
            <div className="rm-preview-task-list rm-scroll-list">
              {jobs.map((job) => {
                const offers = jobOffers[job._id] || [];
                const pendingOffers = offers.filter((o) => o.status === 'PENDING');
                const acceptedOffers = offers.filter((o) => o.status === 'ACCEPTED');
                const isFull = (job.workersSelected || 0) >= (job.workersRequired || 1);

                return (
                  <article
                    className="rm-preview-task rm-creator-task"
                    key={job._id}
                    style={{
                      border: isFull ? '2px solid #16a34a' : '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '20px',
                      marginBottom: '20px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span className="rm-badge rm-badge--gray">{job.category}</span>
                        <h3 style={{ margin: '8px 0 4px 0', fontSize: '20px' }}>{job.title}</h3>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
                          📍 {job.location?.city || 'Local area'} · Date: {job.date?.slice(0, 10)} · Time: {job.startTime}-{job.endTime}
                        </p>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span className={`rm-badge ${statusBadgeClass(job.status)}`}>
                          {isFull ? '🎉 WORKERS SELECTED' : job.status}
                        </span>
                        <div style={{ marginTop: '6px', fontSize: '13px', fontWeight: 700, color: '#0f766e' }}>
                          Selected: {job.workersSelected || 0} / {job.workersRequired || 1} workers
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar for Required Workers */}
                    <div
                      style={{
                        height: '8px',
                        background: '#e2e8f0',
                        borderRadius: '4px',
                        margin: '14px 0',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, (((job.workersSelected || 0) / (job.workersRequired || 1)) * 100))}%`,
                          background: isFull ? '#16a34a' : '#0f766e',
                          borderRadius: '4px',
                        }}
                      />
                    </div>

                    {/* Worker Offers Section */}
                    <div style={{ marginTop: '16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '12px',
                        }}
                      >
                        <h4 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>
                          📥 Worker Offers & Quotes ({offers.length})
                        </h4>
                        <span style={{ fontSize: '13px', color: '#64748b' }}>
                          {pendingOffers.length} pending · {acceptedOffers.length} selected
                        </span>
                      </div>

                      {offers.length === 0 ? (
                        <p style={{ fontStyle: 'italic', color: '#94a3b8', fontSize: '14px', margin: '8px 0' }}>
                          No workers have submitted an offer for this job yet.
                        </p>
                      ) : (
                        <div className="rm-offers-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {offers.map((offer) => {
                            const worker = offer.workerId || {};
                            const profile = offer.workerProfile || {};
                            const isAccepted = offer.status === 'ACCEPTED';
                            const isPending = offer.status === 'PENDING';

                            return (
                              <div
                                key={offer._id}
                                style={{
                                  background: isAccepted ? '#f0fdf4' : '#fff',
                                  border: isAccepted ? '2px solid #86efac' : '1px solid #cbd5e1',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    flexWrap: 'wrap',
                                    gap: '10px',
                                  }}
                                >
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <h5 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
                                        👤 {worker.name || 'Worker'}
                                      </h5>
                                      <span className="rm-rating" style={{ fontSize: '13px' }}>
                                        ★ {Number(worker.rating || 0).toFixed(1)}{' '}
                                        <small>({worker.ratingCount || 0})</small>
                                      </span>
                                    </div>

                                    <p style={{ margin: '4px 0', fontSize: '13px', color: '#64748b' }}>
                                      {worker.experienceYears || 0} yrs exp · {profile.tasksTaken || worker.totalJobs || 0} completed tasks
                                      {worker.skills?.length ? ` · Skills: ${worker.skills.join(', ')}` : ''}
                                    </p>

                                    {offer.message && (
                                      <p style={{ margin: '6px 0', fontSize: '13px', color: '#334155', fontStyle: 'italic' }}>
                                        💬 "{offer.message}"
                                      </p>
                                    )}

                                    <p style={{ margin: '4px 0', fontSize: '12px', color: '#94a3b8' }}>
                                      Submitted: {new Date(offer.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                                      {new Date(offer.createdAt).toLocaleDateString()}
                                    </p>
                                  </div>

                                  {/* Proposed Amount Display */}
                                  <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Worker Quote:</span>
                                    <strong style={{ fontSize: '20px', color: '#0f766e' }}>
                                      ₹{offer.proposedAmount}
                                    </strong>
                                    <span className={`rm-badge ${statusBadgeClass(offer.status)}`} style={{ display: 'block', marginTop: '4px' }}>
                                      {isAccepted ? '✓ SELECTED' : offer.status}
                                    </span>
                                  </div>
                                </div>

                                {/* Contact Details (if selected) */}
                                {isAccepted && offer.contactDetails && (
                                  <div
                                    style={{
                                      marginTop: '12px',
                                      background: '#dcfce7',
                                      padding: '10px 14px',
                                      borderRadius: '8px',
                                      fontSize: '14px',
                                      color: '#166534',
                                    }}
                                  >
                                    <strong>📞 Worker Contact: </strong>
                                    <a href={`tel:${offer.contactDetails.mobile}`} style={{ fontWeight: 700, color: '#15803d', textDecoration: 'underline' }}>
                                      {offer.contactDetails.mobile}
                                    </a>
                                    {offer.contactDetails.location?.city && (
                                      <span> · 📍 {offer.contactDetails.location.city}</span>
                                    )}
                                  </div>
                                )}

                                {/* Action Buttons for Creator */}
                                {isPending && (
                                  <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button
                                      className="rm-btn rm-btn--primary"
                                      style={{ padding: '8px 18px', fontSize: '14px', fontWeight: 700 }}
                                      disabled={saving || isFull}
                                      onClick={() => handleSelectOffer(offer, job)}
                                    >
                                      {isFull ? 'Positions Full' : '✓ Accept & Select Worker'}
                                    </button>
                                    <button
                                      className="rm-btn rm-btn--outline"
                                      style={{ padding: '8px 14px', fontSize: '14px', color: '#dc2626', borderColor: '#fca5a5' }}
                                      disabled={saving}
                                      onClick={() => handleRejectOffer(offer)}
                                    >
                                      ✕ Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .getStats()
      .then((res) => setStats(res.data.stats))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load stats.'));
  }, []);

  if (error) return <div className="rm-card rm-empty">{error}</div>;
  if (!stats) return <div className="rm-loading">Loading dashboard...</div>;

  const cards = [
    { label: 'Total Users', value: stats.totalUsers },
    { label: 'Workers', value: stats.workers },
    { label: 'Job Creators', value: stats.jobCreators },
    { label: 'Active Jobs', value: stats.activeJobs },
    { label: 'Completed Jobs', value: stats.completedJobs },
    { label: 'Applications', value: stats.applications },
    { label: 'Open Reports', value: stats.openReports },
    { label: 'Pending Verification', value: stats.pendingVerification },
  ];

  const chartData = [
    { name: 'Workers', value: stats.workers },
    { name: 'Job Creators', value: stats.jobCreators },
    { name: 'Active Jobs', value: stats.activeJobs },
    { name: 'Completed Jobs', value: stats.completedJobs },
    { name: 'Applications', value: stats.applications },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>ROZGARMITRA ADMIN</h2>

      <div className="rm-stat-grid">
        {cards.map((c) => (
          <div className="rm-stat-card" key={c.label}>
            <div className="rm-stat-card__label">{c.label}</div>
            <div className="rm-stat-card__value">{c.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="rm-card">
        <h3>Platform Overview</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Picks the right dashboard for the signed-in role. The branch is made between
 * two components so each one calls its hooks unconditionally — calling the stats
 * effect after the creator redirect would break the rules of hooks.
 */
export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === 'job_creator') return <CreatorDashboard />;

  return <AdminDashboard />;
}

