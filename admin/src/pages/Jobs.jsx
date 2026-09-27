import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/client';

const STATUS_COLORS = {
  POSTED: 'gray',
  APPLICATIONS_RECEIVED: 'blue',
  WORKER_SELECTED: 'amber',
  IN_PROGRESS: 'amber',
  COMPLETED: 'green',
  RATED: 'green',
  CANCELLED: 'red',
};

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .getJobs({ status: status || undefined, search: search || undefined, limit: 50 })
      .then((res) => setJobs(res.data.jobs))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load jobs.'))
      .finally(() => setLoading(false));
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this job? This cannot be undone.')) return;
    await adminApi.removeJob(id);
    load();
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Jobs</h2>

      <div className="rm-filters">
        <select className="rm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="POSTED">Posted</option>
          <option value="APPLICATIONS_RECEIVED">Applications Received</option>
          <option value="WORKER_SELECTED">Worker Selected</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <input
          className="rm-input"
          placeholder="Search job title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
      </div>

      <div className="rm-card">
        {error && <div className="rm-empty">{error}</div>}
        {loading && !error && <div className="rm-loading">Loading jobs...</div>}
        {!loading && !error && jobs.length === 0 && <div className="rm-empty">No jobs found.</div>}
        {!loading && !error && jobs.length > 0 && (
          <div className="rm-scroll-list" style={{ maxHeight: 560 }}>
            <table className="rm-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Creator</th>
                <th>Payment</th>
                <th>Applications</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j._id}>
                  <td>{j.title}</td>
                  <td>{j.category}</td>
                  <td>{j.creatorId?.businessName || j.creatorId?.name || '—'}</td>
                  <td>₹{j.payment}/{j.paymentUnit}</td>
                  <td>{j.applicationsCount}</td>
                  <td>
                    <span className={`rm-badge rm-badge--${STATUS_COLORS[j.status] || 'gray'}`}>
                      {j.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <button className="rm-btn rm-btn--danger" onClick={() => handleRemove(j._id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
