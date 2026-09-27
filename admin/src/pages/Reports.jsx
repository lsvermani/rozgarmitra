import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/client';

const STATUS_COLORS = { OPEN: 'red', REVIEWING: 'amber', RESOLVED: 'green', DISMISSED: 'gray' };

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch only — the spinner is toggled by the events that trigger a reload.
  const fetchReports = useCallback(() => {
    adminApi
      .getReports({ status: status || undefined })
      .then((res) => setReports(res.data.reports))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load reports.'))
      .finally(() => setLoading(false));
  }, [status]);

  // Used after status updates and by the filter, where showing the spinner is expected.
  const load = useCallback(() => {
    setLoading(true);
    fetchReports();
  }, [fetchReports]);

  // `loading` starts as true, so the initial fetch does not need to set it.
  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleStatusChange = async (id, newStatus) => {
    await adminApi.updateReport(id, newStatus);
    load();
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Reports & Complaints</h2>

      <div className="rm-filters">
        <select
          className="rm-select"
          value={status}
          onChange={(e) => {
            // Spinner is toggled by the event that changes the filter, not by the effect.
            setLoading(true);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="REVIEWING">Reviewing</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
      </div>

      <div className="rm-card">
        {error && <div className="rm-empty">{error}</div>}
        {loading && !error && <div className="rm-loading">Loading reports...</div>}
        {!loading && !error && reports.length === 0 && <div className="rm-empty">No reports found. 🎉</div>}
        {!loading && !error && reports.length > 0 && (
          <table className="rm-table">
            <thead>
              <tr>
                <th>Reason</th>
                <th>Reporter</th>
                <th>Reported User</th>
                <th>Job</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r._id}>
                  <td>{r.reason}</td>
                  <td>{r.reporterId?.name || r.reporterId?.mobile || '—'}</td>
                  <td>{r.reportedUserId?.name || r.reportedUserId?.mobile || '—'}</td>
                  <td>{r.jobId?.title || '—'}</td>
                  <td style={{ maxWidth: 200 }}>{r.description || <em>No description</em>}</td>
                  <td>
                    <span className={`rm-badge rm-badge--${STATUS_COLORS[r.status]}`}>{r.status}</span>
                  </td>
                  <td>
                    <select
                      className="rm-select"
                      value={r.status}
                      onChange={(e) => handleStatusChange(r._id, e.target.value)}
                    >
                      <option value="OPEN">Open</option>
                      <option value="REVIEWING">Reviewing</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="DISMISSED">Dismissed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
