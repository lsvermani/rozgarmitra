import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/client';

const EVENT_COLORS = { sign_in: 'green', sign_out: 'amber', live_location: 'blue' };
const ROLE_LABELS = {
  worker: 'Worker', job_creator: 'Job creator', admin: 'Admin',
  system: 'System', manager: 'Manager', viewer: 'Viewer', super_admin: 'Super admin',
};
const RESULT_COLORS = { success: 'green', denied: 'red', error: 'amber' };
const PER_PAGE = 25;

/** 'sign_in' -> 'Sign in'; anything unknown is shown as-is. */
const eventLabel = (event) => {
  if (!event) return 'Other';
  return event.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
};

const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d);
};

/** "1h 04m" / "12m 30s" / "45s" - how long the session lasted. */
const fmtDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return '—';
  const total = Math.max(0, Math.round(Number(seconds)));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins}m ${String(total % 60).padStart(2, '0')}s`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};

/** Profile place, falling back through the fields a job/user actually fills in. */
const placeLabel = (location) => {
  if (!location) return '';
  const parts = [location.locality, location.city, location.state].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(', ');
  return location.address || '';
};

const mapLink = (live) => {
  if (!live || typeof live.latitude !== 'number' || typeof live.longitude !== 'number') return null;
  return `https://www.google.com/maps/search/?api=1&query=${live.latitude},${live.longitude}`;
};

/**
 * "Ludhiana, Punjab, India" for a recorded point.
 *
 * De-duplicated because an IP lookup often reports the same name for the city
 * and the locality. Returns '' when nothing was named, so the cell shows just
 * the coordinates rather than a placeholder.
 */
const livePlaceLabel = (live) => {
  if (!live) return '';
  const parts = [live.city, live.state, live.country]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return [...new Set(parts)].join(', ');
};

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ events: [], modules: [], roles: [], actors: [] });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // One object drives every control, so "change" and "clear" are the same action.
  const [query, setQuery] = useState({
    search: '', event: '', module: '', role: '', result: '', userId: '', from: '', to: '',
  });

  // Fetches without touching `loading` first, so the mount/filter effect below
  // never calls setState synchronously (which triggers a cascading render).
  // `loading` starts as true and the Refresh button sets it before calling this.
  const fetchLogs = useCallback(() => {
    // Empty strings are dropped so the API never filters on blanks.
    const params = Object.fromEntries(
      Object.entries({ ...query, page, limit: PER_PAGE })
        .filter(([, v]) => v !== '' && v !== null && v !== undefined),
    );
    adminApi.getActivityLogs(params)
      .then((res) => {
        setLogs(res.data.logs || []);
        setFilters(res.data.filters || { events: [], modules: [], roles: [], actors: [] });
        setTotal(res.data.total ?? 0);
        setPages(res.data.pages ?? 1);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load activity logs.'))
      .finally(() => setLoading(false));
  }, [query, page]);

  // Used by the Refresh button, where showing the spinner is expected.
  const load = useCallback(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  const activeFilterCount = useMemo(() => Object.values(query).filter((v) => v !== '').length, [query]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    adminApi.getActivitySummary().then((res) => setSummary(res.data)).catch(() => setSummary(null));
  }, []);

  // Any filter change returns to page 1, otherwise you land on an empty page.
  const set = (key) => (event) => {
    setPage(1);
    setQuery((q) => ({ ...q, [key]: event.target.value }));
  };

  const clearAll = () => {
    setPage(1);
    setQuery({ search: '', event: '', module: '', role: '', result: '', userId: '', from: '', to: '' });
  };

return (
    <div>
      <div className="rm-page-heading">
        <div>
          <span className="rm-eyebrow">SUPER ADMIN</span>
          <h2>Activity Logs</h2>
          <p>Every sign-in and sign-out across admins, workers and job creators, with where it happened.</p>
        </div>
        <button className="rm-btn rm-btn--outline" onClick={load}>Refresh</button>
      </div>

      {summary && summary.roles?.length > 0 && (
        <div className="rm-stat-row">
          {summary.roles.map((r) => (
            <div className="rm-stat" key={r.role}>
              <strong>{r.signIns}</strong>
              <span>{ROLE_LABELS[r.role] || r.role} sign-ins</span>
              <small>{r.signOuts} sign-out{r.signOuts === 1 ? '' : 's'}</small>
            </div>
          ))}
        </div>
      )}

      <div className="rm-filters rm-filters--wrap">
        <input
          className="rm-input rm-input--search"
          placeholder="Search name, action, IP, place..."
          value={query.search}
          onChange={set('search')}
        />

        <select className="rm-select" value={query.event} onChange={set('event')}>
          <option value="">All types</option>
          {filters.events.map((e) => <option key={e} value={e}>{eventLabel(e)}</option>)}
        </select>

        <select className="rm-select" value={query.role} onChange={set('role')}>
          <option value="">All roles</option>
          {filters.roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
        </select>

        <select className="rm-select" value={query.module} onChange={set('module')}>
          <option value="">All modules</option>
          {filters.modules.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
        </select>

        <select className="rm-select" value={query.userId} onChange={set('userId')}>
          <option value="">All people</option>
          {filters.actors.map((a) => (
            <option key={a.userId} value={a.userId}>
              {a.actorName} ({ROLE_LABELS[a.role] || a.role}) · {a.count}
            </option>
          ))}
        </select>

        <select className="rm-select" value={query.result} onChange={set('result')}>
          <option value="">Any result</option>
          <option value="success">Success</option>
          <option value="denied">Denied</option>
          <option value="error">Error</option>
        </select>

        <label className="rm-daterange">
          From
          <input type="date" className="rm-input" value={query.from} onChange={set('from')} />
        </label>
        <label className="rm-daterange">
          To
          <input type="date" className="rm-input" value={query.to} onChange={set('to')} />
        </label>

        {activeFilterCount > 0 && (
          <button className="rm-btn rm-btn--outline" onClick={clearAll}>
            Clear ({activeFilterCount})
          </button>
        )}
        <span className="rm-hint">{total} entr{total === 1 ? 'y' : 'ies'}</span>
      </div>
<div className="rm-card">
        {error && <div className="rm-empty">{error}</div>}
        {loading && !error && <div className="rm-loading">Loading activity logs...</div>}
        {!loading && !error && logs.length === 0 && (
          <div className="rm-empty">
            {activeFilterCount === 0
              ? 'No activity has been recorded yet.'
              : 'No entries match the current filters.'}
          </div>
        )}
        {!loading && !error && logs.length > 0 && (
          <div className="rm-table-wrap">
            <table className="rm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Type</th>
                  <th>Action</th>
                  <th>Location</th>
                  <th>Live location</th>
                  <th>Session</th>
                  <th>Device</th>
                  <th>IP</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const place = placeLabel(log.location);
                  const live = log.liveLocation || {};
                  const mapUrl = mapLink(live);
                  const livePlace = livePlaceLabel(live);
                  return (
                    <tr key={log._id}>
                      <td><small>{fmtDateTime(log.createdAt)}</small></td>
                      <td>
                        <strong>{log.actorName || 'system'}</strong>
                        <br />
                        <small>{ROLE_LABELS[log.role] || log.role}</small>
                      </td>
                      <td>
                        <span className={`rm-badge rm-badge--${EVENT_COLORS[log.event] || 'gray'}`}>
                          {eventLabel(log.event)}
                        </span>
                      </td>
                      <td><small>{log.action}</small></td>
                      <td>
                        {place || '—'}
                        {!place && log.location?.address
                          ? <><br /><small>{log.location.address}</small></>
                          : null}
                      </td>
                      <td>
                        {mapUrl ? (
                          <>
                            <a className="rm-link" href={mapUrl} target="_blank" rel="noreferrer">
                              {live.latitude.toFixed(4)}, {live.longitude.toFixed(4)}
                              {live.accuracy ? ` ±${live.accuracy}m` : ''}
                            </a>
                            {/* The place the point falls in, so the row reads as
                                "Ludhiana, Punjab" instead of a bare coordinate
                                pair. Blank when the geocoder named nothing. */}
                            {livePlace && <><br /><small>{livePlace}</small></>}
                            {/* An IP-derived point is only accurate to roughly a
                                city, so it is labelled rather than presented as
                                if it came from the device's GPS. */}
                            {live.precision === 'city' && (
                              <><br /><small>approx. via IP</small></>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td><small>{fmtDuration(log.sessionSeconds)}</small></td>
                      <td><small>{log.platform || '—'}</small></td>
                      <td><small>{log.ip || '—'}</small></td>
                      <td>
                        <span className={`rm-badge rm-badge--${RESULT_COLORS[log.result] || 'gray'}`}>
                          {log.result}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="rm-pagination">
          <button className="rm-btn rm-btn--outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <span>Page {page} of {pages}</span>
          <button className="rm-btn rm-btn--outline" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
