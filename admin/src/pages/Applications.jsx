import { useCallback, useEffect, useState } from 'react';
import { applicationsApi } from '../api/client';

const STATUS_COLORS = { APPLIED: 'blue', SHORTLISTED: 'amber', SELECTED: 'green', ACCEPTED: 'green', COMPLETED: 'green', REJECTED: 'red' };

export default function Applications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Kept free of synchronous setState so the mount effect below stays side-effect light.
  const fetchApplications = useCallback(() => {
    applicationsApi.list().then((response) => setApplications(response.data.applications)).catch((err) => setError(err.response?.data?.message || 'Failed to load applications.')).finally(() => setLoading(false));
  }, []);
  // Used by the Refresh button (an event) where toggling the spinner is expected.
  const load = useCallback(() => {
    setLoading(true);
    fetchApplications();
  }, [fetchApplications]);
  // `loading` starts as true, so the initial fetch does not need to set it.
  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  return <div>
    <div className="rm-page-heading"><div><span className="rm-eyebrow">SUPER ADMIN</span><h2>Applications</h2><p>Monitor worker applications and task progress across Rozgarmitra.</p></div><button className="rm-btn rm-btn--outline" onClick={load}>Refresh</button></div>
    <div className="rm-card">
      {error && <div className="rm-empty">{error}</div>}
      {loading && !error && <div className="rm-loading">Loading applications...</div>}
      {!loading && !error && applications.length === 0 && <div className="rm-empty">No applications have been submitted.</div>}
      {!loading && !error && applications.length > 0 && <div className="rm-table-wrap"><table className="rm-table"><thead><tr><th>Worker</th><th>Task</th><th>Job creator</th><th>Location</th><th>Applied</th><th>Status</th></tr></thead><tbody>{applications.map((application) => {
        const worker = application.workerId || {}; const job = application.jobId || {}; const creator = job.creatorId || {};
        return <tr key={application._id}><td><strong>{worker.name || 'Unnamed worker'}</strong><br /><small>{worker.mobile || '—'} · ★ {Number(worker.rating || 0).toFixed(1)}</small></td><td>{job.title || 'Deleted task'}<br /><small>{job.category || '—'}</small></td><td>{creator.businessName || creator.name || '—'}<br /><small>{creator.mobile || '—'}</small></td><td>{job.location?.city || '—'}</td><td>{application.createdAt ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(application.createdAt)) : '—'}</td><td><span className={`rm-badge rm-badge--${STATUS_COLORS[application.status] || 'gray'}`}>{application.status}</span></td></tr>;
      })}</tbody></table></div>}
    </div>
  </div>;
}
