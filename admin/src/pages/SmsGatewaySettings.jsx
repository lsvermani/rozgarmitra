import { useCallback, useEffect, useState } from 'react';
import { smsGatewayApi } from '../api/client';

const fmtDateTime = (value) => {
  if (!value) return 'never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'never';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d);
};

/** A gateway is only ONLINE if it checked in *and* reports a usable SIM. */
const isOnline = (device) => {
  if (!device || !device.lastHeartbeat) return false;
  const ageMs = Date.now() - new Date(device.lastHeartbeat).getTime();
  return device.active && ageMs < 2 * 60 * 1000;
};

const Row = ({ label, value, ok }) => (
  <div className="rm-field">
    <span className="rm-field__label">{label}</span>
    <span className="rm-field__value">
      {typeof ok === 'boolean' ? (
        <span className={`rm-badge rm-badge--${ok ? 'green' : 'gray'}`}>{value}</span>
      ) : value}
    </span>
  </div>
);

/**
 * Admin -> Settings -> SMS OTP Gateway.
 *
 * Answers one question above all: is the gateway phone able to send right now?
 * A gateway that has checked in but reports no SIM is shown as OFFLINE,
 * because that is the state in which every OTP silently fails.
 *
 * The gateway secret is never rendered - only whether one is configured.
 */
export default function SmsGatewaySettings() {
  const [config, setConfig] = useState(null);
  const [devices, setDevices] = useState([]);
  const [stats, setStats] = useState(null);
  const [healthy, setHealthy] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [cfg, dev] = await Promise.all([smsGatewayApi.config(), smsGatewayApi.devices()]);
      setConfig(cfg.data.config);
      setDevices(dev.data.devices || []);
      setHealthy(dev.data.healthyDevice);
      setStats(dev.data.stats);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load gateway settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while the page is open so ONLINE/OFFLINE stays truthful.
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const sendTest = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    setBusy(true);
    try {
      await smsGatewayApi.sendTestSms(testPhone.replace(/\D/g, ''));
      setNotice('Test SMS queued. It will be sent when the gateway polls.');
      setTestPhone('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not queue the test SMS.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="rm-empty">Loading gateway settings…</div>;

  return (
    <div className="rm-card">
      <h2>SMS OTP Gateway</h2>
      <p className="rm-muted">
        OTP messages are sent from an Android phone holding a physical SIM. The phone
        polls this backend over HTTPS — it is never exposed to the internet.
      </p>

      <h3>Status</h3>
      <Row label="Gateway enabled" value={config?.enabled ? 'Enabled' : 'Disabled'} ok={config?.enabled} />
      <Row label="Any gateway online" value={healthy ? 'ONLINE' : 'OFFLINE'} ok={healthy} />
      <Row label="Gateway ID" value={<code>{config?.gatewayId || '—'}</code>} />
      <Row label="Sender number (SIM)" value={<code>{config?.phoneNumber || 'not set'}</code>} />

      <h3>Gateway devices</h3>
      {devices.length === 0 ? (
        <div className="rm-hint">No gateway has registered yet.</div>
      ) : (
        devices.map((d) => {
          const online = isOnline(d);
          return (
            <div key={d.deviceId} className="rm-card" style={{ marginBottom: 12 }}>
              <Row label="Device" value={<code>{d.deviceId}</code>} />
              <Row label="Status" value={online ? 'ONLINE' : 'OFFLINE'} ok={online} />
              <Row label="SIM" value={d.simStatus === 'available' ? 'AVAILABLE' : 'NOT AVAILABLE'} ok={d.simStatus === 'available'} />
              <Row label="Network" value={d.networkStatus === 'connected' ? 'CONNECTED' : 'DISCONNECTED'} ok={d.networkStatus === 'connected'} />
              <Row label="Last heartbeat" value={fmtDateTime(d.lastHeartbeat)} />
              <Row label="Sent" value={d.stats?.sent ?? 0} />
              <Row label="Failed" value={d.stats?.failed ?? 0} />
              {d.deviceModel ? <Row label="Device" value={d.deviceModel} /> : null}
            </div>
          );
        })
      )}

      <h3>Queue</h3>
      {stats ? (
        <div className="rm-stats">
          <div className="rm-stat"><strong>{stats.queued ?? 0}</strong><span>Pending</span></div>
          <div className="rm-stat"><strong>{stats.claimed ?? 0}</strong><span>In flight</span></div>
          <div className="rm-stat"><strong>{stats.sent ?? 0}</strong><span>Sent</span></div>
          <div className="rm-stat"><strong>{stats.delivered ?? 0}</strong><span>Delivered</span></div>
          <div className="rm-stat"><strong>{stats.failed ?? 0}</strong><span>Failed</span></div>
          <div className="rm-stat"><strong>{stats.unknown ?? 0}</strong><span>Unknown</span></div>
        </div>
      ) : <div className="rm-hint">Statistics unavailable.</div>}

      <h3>Send test SMS</h3>
      <p className="rm-hint">
        Queues a message to a number you choose. Use a handset that is not the
        gateway SIM itself, so you can confirm real delivery.
      </p>
      <form onSubmit={sendTest} className="rm-form-row">
        <input
          type="tel"
          inputMode="numeric"
          placeholder="Recipient mobile number"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
        />
        <button className="rm-btn rm-btn--primary" disabled={busy || testPhone.length < 10}>
          {busy ? 'Queueing…' : 'Send test SMS'}
        </button>
      </form>
      {notice && <div className="rm-hint">{notice}</div>}
      {error && <div className="rm-error">{error}</div>}

      <h3>Credentials</h3>
      <div className="rm-hint">
        The gateway secret is never shown here. Set it in{' '}
        <code>backend/.env</code> as <code>SMS_GATEWAY_SECRET</code>, or leave it blank
        and let each phone register its own token (recommended).
      </div>
      <Row label="Secret configured" value={config?.secretSet ? 'Yes' : 'No (per-device tokens)'} ok={config?.secretSet} />
      <Row label="Secret hint" value={<code>{config?.secretHint || '—'}</code>} />

      <div style={{ marginTop: 16 }}>
        <button className="rm-btn rm-btn--outline" onClick={load}>Refresh</button>
      </div>
    </div>
  );
}
