import { useCallback, useEffect, useMemo, useState } from 'react';
import { applicationsApi } from '../api/client';

const STATUS_COLORS = { APPLIED: 'blue', SHORTLISTED: 'amber', SELECTED: 'green', ACCEPTED: 'green', COMPLETED: 'green', REJECTED: 'red' };

/**
 * Builds the best available human-readable place from a job's `location`.
 * Seeded jobs carry `locality` + `address` but leave `city` empty, so falling
 * back in order (city -> locality -> address) is what makes the Location column
 * show real values instead of a dash.
 */
const placeLabel = (location) => {
  if (!location) return '—';
  const parts = [location.locality, location.city, location.state].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(', ');
  return location.address || '—';
};

const dateLabel = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
};

export default function Applications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  // Kept free of synchronous setState so the mount effect below stays side-effect light.
  const fetchApplications = useCallback(() => {
    applicationsApi.list().then((response) => setApplications(response.data.applications || [])).catch((err) => setError(err.response?.data?.message || 'Failed to load applications.')).finally(() => setLoading(false));
  }, []);
  // Used by the Refresh button (an event) where toggling the spinner is expected.
  const load = useCallback(() => {
    setLoading(true);
    fetchApplications();
  }, [fetchApplications]);
  // `loading` starts as true, so the initial fetch does not need to set it.
  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // Status + free-text filtering happens client-side: the endpoint returns the
  // full (small) application list, so this keeps the table instant.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applications.filter((a) => {
      if (status && a.status !== status) return false;
      if (!term) return true;
      const worker = a.workerId || {};
      const job = a.jobId || {};
      const creator = job.creatorId || {};
      return [worker.name, worker.mobile, job.title, job.category, creator.businessName, creator.name, placeLabel(job.location)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [applications, status, search]);

  const renderRow = (application) => {
    const worker = application.workerId || {};
    const job = application.jobId || {};
    // creatorId is populated by the API; fall back to the raw id if it ever is not.
    const creator = job.creatorId || {};
    const creatorLabel = creator.businessName || creator.name || (job.creatorId ? String(job.creatorId) : '—');
    return (
      <tr key={application._id}>
        <td>
          <strong>{worker.name || 'Unnamed worker'}</strong>
          <br />
          <small>{worker.mobile || '—'} · ★ {Number(worker.rating || 0).toFixed(1)}</small>
        </td>
        <td>{job.title || 'Deleted task'}<br /><small>{job.category || '—'}</small></td>
        <td>{creatorLabel}<br /><small>{creator.mobile || '—'}</small></td>
        <td>{placeLabel(job.location)}</td>
        {/* `appliedAt` is the real application date; `createdAt` is only a
            document timestamp and is used as a safety net. */}
        <td>{dateLabel(application.appliedAt || application.createdAt)}</td>
        <td><span className={`rm-badge rm-badge--${STATUS_COLORS[application.status] || 'gray'}`}>{application.status}</span></td>
      </tr>
    );
  };

  return <div>
    <div className="rm-page-heading"><div><span className="rm-eyebrow">SUPER ADMIN</span><h2>Applications</h2><p>Monitor worker applications and task progress across Rozgarmitra.</p></div><button className="rm-btn rm-btn--outline" onClick={load}>Refresh</button></div>
    <div className="rm-filters">
      <select className="rm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input
        className="rm-input rm-input--search"
        placeholder="Search worker, task, creator or place..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <span className="rm-hint">{visible.length} of {applications.length} applications</span>
    </div>
    <div className="rm-card">
      {error && <div className="rm-empty">{error}</div>}
      {loading && !error && <div className="rm-loading">Loading applications...</div>}
      {!loading && !error && visible.length === 0 && <div className="rm-empty">{applications.length === 0 ? 'No applications have been submitted.' : 'No applications match the current filters.'}</div>}
      {!loading && !error && visible.length > 0 && <div className="rm-table-wrap"><table className="rm-table"><thead><tr><th>Worker</th><th>Task</th><th>Job creator</th><th>Location</th><th>Applied</th><th>Status</th></tr></thead><tbody>{visible.map(renderRow)}</tbody></table></div>}
    </div>
  </div>;
}
