import { useCallback, useEffect, useState } from 'react';
import { whatsappApi } from '../api/client';

/**
 * Admin → Settings → WhatsApp OTP.
 *
 * Read-only on the credential side by design: the Meta access token and phone
 * number ID are supplied through the server's environment and are never editable
 * from a browser - doing so would mean shipping a secret to the client and
 * accepting it back. This page reports what is loaded (booleans plus a masked
 * hint) and names the exact variables an operator has to set.
 *
 * Statistics are aggregate counts only. No OTP content is displayed, because none
 * is retained in a readable form.
 */
const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d);
};

const Row = ({ label, children }) => (
  <div className="rm-field">
    <span className="rm-field__label">{label}</span>
    <span className="rm-field__value">{children}</span>
  </div>
);

const Badge = ({ on, onLabel = 'Enabled', offLabel = 'Disabled' }) => (
  <span className={`rm-badge rm-badge--${on ? 'green' : 'gray'}`}>{on ? onLabel : offLabel}</span>
);

/** One environment variable, with where its value comes from. */
function EnvRow({ name, source, value, ok }) {
  return (
    <tr>
      <td><code>{name}</code></td>
      <td><small>{source}</small></td>
      <td><code>{value || <small>(not set)</small>}</code></td>
      <td><Badge on={ok} onLabel="Set" offLabel="Missing" /></td>
    </tr>
  );
}

export default function WhatsAppSettings() {
  const [config, setConfig] = useState(null);
  const [reason, setReason] = useState('');
  const [stats, setStats] = useState(null);
  const [failures, setFailures] = useState([]);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, stat] = await Promise.all([
        whatsappApi.getConfig(),
        whatsappApi.getStats().catch(() => null),
      ]);
      setConfig(cfg.data.config);
      setReason(cfg.data.reason || '');
      setStats(stat?.data?.stats || null);
      whatsappApi.getFailures()
        .then((res) => setFailures(res.data.failures || []))
        .catch(() => setFailures([]));
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load WhatsApp settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runConnectionTest = async () => {
    setTesting(true);
    setNotice('');
    setError('');
    try {
      const res = await whatsappApi.testConnection();
      setNotice(res.data.message || 'WhatsApp connection successful.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reach WhatsApp.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="rm-empty">Loading WhatsApp settings…</div>;

  if (!config) {
    return (
      <div className="rm-card">
        <h2>WhatsApp OTP</h2>
        <div className="rm-error">{error || 'Settings unavailable.'}</div>
        <button className="rm-btn rm-btn--outline" onClick={load}>Retry</button>
      </div>
    );
  }
  return (
    <div className="rm-card">
      <h2>WhatsApp OTP Settings</h2>
      <p className="rm-muted">
        OTPs are delivered through the official Meta WhatsApp Business Cloud API.
        Credentials live only in the server environment and are never sent to the browser.
      </p>

      <h3>Status</h3>
      <Row label="Service"><Badge on={config.enabled} /></Row>
      <Row label="Usable"><Badge on={config.active} onLabel="Ready" offLabel="Not ready" /></Row>
      {reason && <div className="rm-hint">{reason}</div>}

      <h3>OTP policy</h3>
      <Row label="OTP length">{config.otpLength} digits</Row>
      <Row label="OTP expiry">{config.otpExpiryMinutes} minutes</Row>
      <Row label="Resend cooldown">{config.otpResendSeconds} seconds</Row>
      <Row label="Maximum attempts">{config.otpMaxAttempts}</Row>
      <Row label="Per-number limit">{config.perPhoneHourlyLimit} per hour</Row>

      <h3>WhatsApp template</h3>
      <Row label="Template name"><code>{config.templateName || <small>(not set)</small>}</code></Row>
      <Row label="Template language"><code>{config.languageCode}</code></Row>
      <Row label="Business number">+91 8699142699</Row>
      <Row label="Graph API version"><code>{config.apiVersion}</code></Row>

      <h3>Credentials</h3>
      <p className="rm-hint">
        Set these in <code>backend/.env</code> and restart the server. They are read from the
        environment only — there is deliberately no field here that could write a secret to the browser.
      </p>
      <table className="rm-table">
        <thead>
          <tr><th>Variable</th><th>Source</th><th>Current</th><th>State</th></tr>
        </thead>
        <tbody>
          <EnvRow name="WHATSAPP_ACCESS_TOKEN" source="Meta" value={config.accessTokenHint} ok={config.accessTokenSet} />
          <EnvRow name="WHATSAPP_PHONE_NUMBER_ID" source="Meta" value={config.phoneNumberId} ok={config.phoneNumberIdSet} />
          <EnvRow name="WHATSAPP_BUSINESS_ACCOUNT_ID" source="Meta" value="" ok={config.businessAccountIdSet} />
          <EnvRow name="WHATSAPP_OTP_TEMPLATE_NAME" source="Meta" value={config.templateName} ok={Boolean(config.templateName)} />
        </tbody>
      </table>
      <div className="rm-hint">
        The access token is shown masked (last 4 characters only) and is never returned in full.
      </div>

      <h3>Connection</h3>
      <button className="rm-btn rm-btn--outline" onClick={runConnectionTest} disabled={testing}>
        {testing ? 'Testing…' : 'Test WhatsApp Connection'}
      </button>
      {notice && <div className="rm-hint">{notice}</div>}
      {error && <div className="rm-error">{error}</div>}

      <h3>OTP statistics</h3>
      {stats ? (
        <div className="rm-stats">
          <div className="rm-stat"><strong>{stats.requests}</strong><span>Requests</span></div>
          <div className="rm-stat"><strong>{stats.sent}</strong><span>Delivered</span></div>
          <div className="rm-stat"><strong>{stats.verified}</strong><span>Verified</span></div>
          <div className="rm-stat"><strong>{stats.expired}</strong><span>Expired</span></div>
          <div className="rm-stat"><strong>{stats.resends}</strong><span>Resends</span></div>
          <div className="rm-stat"><strong>{stats.failed}</strong><span>Failures</span></div>
          <div className="rm-stat"><strong>{stats.verificationRate}%</strong><span>Rate</span></div>
        </div>
      ) : <div className="rm-hint">Statistics unavailable.</div>}

      <h3>Recent delivery failures</h3>
      {failures.length === 0 ? (
        <div className="rm-hint">No delivery failures recorded.</div>
      ) : (
        <div className="rm-table-wrap">
          <table className="rm-table">
            <thead>
              <tr><th>When</th><th>Number</th><th>Purpose</th><th>Meta code</th><th>Attempts</th></tr>
            </thead>
            <tbody>
              {failures.map((f, i) => (
                <tr key={f._id || i}>
                  <td><small>{fmtDateTime(f.updatedAt || f.createdAt)}</small></td>
                  <td><code>{f.phone}</code></td>
                  <td><small>{f.purpose}</small></td>
                  <td><small>{f.deliveryErrorCode || '—'}</small></td>
                  <td><small>{f.attempts}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="rm-hint">Phone numbers are masked. OTP contents are never stored or displayed.</div>
    </div>
  );
}
