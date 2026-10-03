import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/client';

const PER_PAGE = 25;

const ROLE_LABELS = {
  worker: 'Worker', job_creator: 'Job creator', admin: 'Admin',
  super_admin: 'Super admin', manager: 'Manager', viewer: 'Viewer', unknown: 'Unknown',
};

const CHANNEL_LABELS = {
  sms: 'SMS', whatsapp: 'WhatsApp', startmessaging: 'StartMessaging',
  capcom6: 'Mock (capcom6)', gateway: 'Android gateway',
};

const PURPOSE_LABELS = {
  login: 'Sign in', registration: 'Registration', phone_change: 'Number change',
};

/**
 * Failure reasons as an admin should read them, not as the API spells them.
 * A missing entry falls back to the raw code rather than hiding it - an
 * unrecognised reason is a signal in itself.
 */
const REASON_LABELS = {
  invalid_otp: 'Wrong code',
  otp_expired: 'Code expired',
  too_many_attempts: 'Too many attempts',
  no_otp: 'No code was sent',
  otp_used: 'Code already used',
  unauthorized: 'Number not authorised',
  user_not_found: 'No account for this number',
  no_admin_account: 'Not an admin account',
  blocked: 'Account blocked',
  malformed_otp: 'Malformed code',
  unusable_number: 'Number not usable',
};

/** Failures are the rows worth noticing, so failures get the loud colour. */
const OUTCOME_COLORS = { success: 'green', failed: 'red' };

const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d);
};

/** Best available name: the denormalised copy, else the populated account. */
const whoLabel = (row) => {
  if (row.actorName) return row.actorName;
  if (row.userId && typeof row.userId === 'object') {
    return row.userId.name || row.userId.mobile || 'Unnamed';
  }
  return 'Unlinked number';
};

/**
 * "Sign in" / "Registration", with the provider in parentheses.
 * Shown as one cell so the table stays readable at the widths this panel runs.
 */
const channelLabel = (row) => {
  const purpose = PURPOSE_LABELS[row.purpose] || row.purpose || 'Sign in';
  const channel = CHANNEL_LABELS[row.channel] || row.channel;
  return channel ? `${purpose} · ${channel}` : purpose;
};

export default function OtpVerifications() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  // Seeded true so the first paint shows the spinner rather than an empty
  // table. Cleared in `.finally` so BOTH outcomes settle: an error that only
  // setRows leaves `loading` true and the table never renders at all, which
  // looks identical to "no verifications exist".
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState({
    search: '', role: '', outcome: '', channel: '', purpose: '', from: '', to: '',
  });

  const fetchRows = useCallback(() => {
    // Blank filters are dropped so the URL stays readable and the server does
    // not have to special-case empty strings.
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== ''));
    return adminApi.getOtpVerifications({ ...params, page, limit: PER_PAGE })
      .then((res) => {
        setRows(res.data.data || []);
        setTotal(res.data.total || 0);
        setPages(res.data.pages || 1);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load OTP verifications.'))
      // `.finally`, not the success branch: clearing only on success is what
      // leaves the spinner up forever when the request fails.
      .finally(() => setLoading(false));
  }, [query, page]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // The summary follows the same filters as the table, minus the search box -
  // so the cards describe the slice actually on screen.
  useEffect(() => {
    const params = Object.fromEntries(
      Object.entries(query).filter(([k, v]) => k !== 'search' && v !== ''),
    );
    adminApi.getOtpSummary(params).then((res) => setSummary(res.data)).catch(() => setSummary(null));
  }, [query]);

  const load = useCallback(() => {
    setLoading(true);
    fetchRows();
  }, [fetchRows]);

  const activeFilterCount = useMemo(() => Object.values(query).filter((v) => v !== '').length, [query]);

  const set = (key) => (event) => {
    setPage(1);
    setQuery((q) => ({ ...q, [key]: event.target.value }));
  };

  const clearAll = () => {
    setPage(1);
    setQuery({ search: '', role: '', outcome: '', channel: '', purpose: '', from: '', to: '' });
  };

  return (
    <div>
      <div className="rm-page-heading">
        <div>
          <span className="rm-eyebrow">SECURITY</span>
          <h2>OTP Verification Log</h2>
          <p>Every OTP check across workers, job creators and admins — who, when, and whether it passed.</p>
        </div>
        <button className="rm-btn rm-btn--outline" onClick={load}>Refresh</button>
      </div>

      {summary && summary.total > 0 && (
        <div className="rm-stat-row">
          <div className="rm-stat">
            <strong>{summary.success}</strong>
            <span>Verified</span>
            <small>of {summary.total} attempt{summary.total === 1 ? '' : 's'}</small>
          </div>
          <div className="rm-stat">
            <strong>{summary.failed}</strong>
            <span>Failed</span>
            <small>{summary.failed > 0 ? 'wrong or expired code' : 'none'}</small>
          </div>
          <div className="rm-stat">
            <strong>{summary.successRate}%</strong>
            <span>Success rate</span>
            <small>{summary.distinctUsers} distinct account{summary.distinctUsers === 1 ? '' : 's'}</small>
          </div>
          {(summary.byRole || []).map((r) => (
            <div className="rm-stat" key={r.role}>
              <strong>{r.success}</strong>
              <span>{ROLE_LABELS[r.role] || r.role}</span>
              <small>{r.total} attempt{r.total === 1 ? '' : 's'}</small>
            </div>
          ))}
        </div>
      )}
<div className="rm-toolbar">
        <input
          className="rm-input rm-input--search"
          placeholder="Search name, phone, IP, reason..."
          value={query.search}
          onChange={set('search')}
        />

        <select className="rm-select" value={query.role} onChange={set('role')}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select className="rm-select" value={query.outcome} onChange={set('outcome')}>
          <option value="">Any result</option>
          <option value="success">Verified</option>
          <option value="failed">Failed</option>
        </select>

        <select className="rm-select" value={query.channel} onChange={set('channel')}>
          <option value="">All channels</option>
          {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select className="rm-select" value={query.purpose} onChange={set('purpose')}>
          <option value="">All purposes</option>
          {Object.entries(PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
        <span className="rm-hint">{total} attempt{total === 1 ? '' : 's'}</span>
      </div>

      <div className="rm-card">
        {error && <div className="rm-empty">{error}</div>}
        {loading && !error && <div className="rm-loading">Loading OTP verifications...</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="rm-empty">
            {activeFilterCount === 0
              ? 'No OTP verification has been recorded yet.'
              : 'No attempts match the current filters.'}
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="rm-table-wrap">
            <table className="rm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Purpose / channel</th>
                  <th>Result</th>
                  <th>Reason</th>
                  <th>Attempts</th>
                  <th>Device</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td><small>{fmtDateTime(row.verifiedAt)}</small></td>
                    <td><strong>{whoLabel(row)}</strong></td>
                    <td><small>{ROLE_LABELS[row.role] || row.role}</small></td>
                    <td><small>{row.phoneMasked || '—'}</small></td>
                    <td><small>{channelLabel(row)}</small></td>
                    <td>
                      <span className={`rm-badge rm-badge--${OUTCOME_COLORS[row.outcome] || 'gray'}`}>
                        {row.outcome === 'success' ? 'Verified' : 'Failed'}
                      </span>
                    </td>
                    <td>
                      <small>{row.reason ? (REASON_LABELS[row.reason] || row.reason) : '—'}</small>
                    </td>
                    <td><small>{row.attemptsUsed ?? '—'}</small></td>
                    <td><small>{row.platform || '—'}</small></td>
                    <td><small>{row.ip || '—'}</small></td>
                  </tr>
                ))}
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