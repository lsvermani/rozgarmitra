import { useEffect, useState } from 'react';
import { jobsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_LABELS = {
  POSTED: 'Open for applications',
  APPLICATIONS_RECEIVED: 'Applications received',
  WORKER_SELECTED: 'Worker selected',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  RATED: 'Completed',
  CANCELLED: 'Cancelled',
};

const formatDate = (value) => new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}).format(new Date(value));

export default function WorkerDashboard() {
  const { user, logout } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    jobsApi.list({ search: search || undefined, category: category || undefined, limit: 50 })
      .then((response) => {
        if (active) setJobs(response.data.jobs);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || 'Could not load jobs.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [search, category]);

  const applyToJob = async (jobId) => {
    setApplyingId(jobId);
    setMessage('');
    setError('');
    try {
      const response = await jobsApi.apply(jobId);
      setMessage(response.data.message);
      setJobs((currentJobs) => currentJobs.map((job) => (
        job._id === jobId
          ? { ...job, applicationsCount: (job.applicationsCount || 0) + 1, status: job.status === 'POSTED' ? 'APPLICATIONS_RECEIVED' : job.status, myApplication: { status: 'APPLIED' } }
          : job
      )));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit application.');
    } finally {
      setApplyingId('');
    }
  };

  const canApply = (job) => ['POSTED', 'APPLICATIONS_RECEIVED'].includes(job.status) && !job.myApplication;

  return (
    <div className="rm-worker-app">
      <header className="rm-worker-topbar">
        <div>
          <div className="rm-login-mark">ROZGARMITRA / WORKER</div>
          <h1>Good morning, {user?.name || 'worker'}</h1>
          <p>Find a shift that fits your day.</p>
        </div>
        <button className="rm-btn rm-btn--outline" onClick={() => { logout(); window.location.href = '/worker/login'; }}>
          Sign out
        </button>
      </header>

      <section className="rm-worker-intro">
        <div>
          <span className="rm-eyebrow">JOB BOARD</span>
          <h2>Work near you</h2>
          <p>Browse local opportunities and send your application directly to the job creator.</p>
        </div>
        <div className="rm-worker-stat"><strong>{jobs.length}</strong><span>jobs available</span></div>
      </section>

      <div className="rm-worker-filters">
        <input
          className="rm-input"
          placeholder="Search jobs, skills or locations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="rm-select" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          <option value="Construction">Construction</option>
          <option value="Household">Household</option>
          <option value="Shops & Businesses">Shops & Businesses</option>
          <option value="Events">Events</option>
        </select>
      </div>

      {message && <div className="rm-worker-alert rm-worker-alert--success">{message}</div>}
      {error && <div className="rm-worker-alert rm-worker-alert--error">{error}</div>}
      {loading && <div className="rm-loading">Finding jobs...</div>}
      {!loading && jobs.length === 0 && <div className="rm-empty">No jobs match your search.</div>}

      {!loading && jobs.length > 0 && (
        <div className="rm-job-grid">
          {jobs.map((job) => (
            <article className="rm-job-card" key={job._id}>
              <div className="rm-job-card__topline">
                <span className="rm-badge rm-badge--blue">{job.category}</span>
                <span className="rm-job-card__date">{formatDate(job.date)}</span>
              </div>
              <h3>{job.title}</h3>
              <p className="rm-job-card__creator">{job.creatorId?.businessName || job.creatorId?.name || 'Local employer'}</p>
              <p className="rm-job-card__description">{job.description}</p>
              <div className="rm-job-card__details">
                <span>₹{job.payment}/{job.paymentUnit}</span>
                <span>{job.startTime} - {job.endTime}</span>
                <span>{job.location?.city || 'Nearby'}</span>
              </div>
              <div className="rm-job-card__footer">
                <span className="rm-job-card__status">{STATUS_LABELS[job.status] || job.status}</span>
                {job.myApplication ? (
                  <button className="rm-btn rm-btn--success" disabled>Applied</button>
                ) : canApply(job) ? (
                  <button className="rm-btn rm-btn--primary" disabled={applyingId === job._id} onClick={() => applyToJob(job._id)}>
                    {applyingId === job._id ? 'Applying...' : 'Apply now'}
                  </button>
                ) : (
                  <button className="rm-btn rm-btn--outline" disabled>Closed</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
