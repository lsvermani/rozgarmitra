import { useCallback, useEffect, useRef, useState } from 'react';

const WIDGET_SRC = 'https://verify.msg91.com/otp-provider.js';

/** MSG91 expects the country code with no `+`, e.g. `918699142699`. */
export const toMsg91Identifier = (e164) => String(e164 || '').replace(/^\+/, '').replace(/\D/g, '');

/** Turns MSG91's failure payload into a short, safe sentence. */
function readError(error) {
  const raw = typeof error === 'string' ? error : (error?.message || '');
  if (!raw) return 'Verification failed. Please try again.';
  if (/expired/i.test(raw)) return 'That code has expired. Please request a new one.';
  if (/invalid|incorrect|wrong/i.test(raw)) return 'Incorrect code. Please try again.';
  if (/rate|limit|too many/i.test(raw)) return 'Too many attempts. Please wait and try again.';
  return 'Verification failed. Please try again.';
}

/**
 * MSG91 OTP Widget, driven through its exposed methods.
 *
 * `exposeMethods: true` is what puts `sendOtp` / `retryOtp` / `verifyOtp` on
 * `window` and suppresses MSG91's own popup, so this component owns the UI.
 *
 * Credentials: `widgetId` + `tokenAuth` are fetched at runtime from
 * `GET /api/auth/msg91/widget-config` and held in memory only - never in source,
 * localStorage or a cookie, so they are not readable out of the JS bundle.
 *
 * Trust boundary: the widget's success payload is a *claim*. It is posted to
 * `POST /api/auth/msg91/complete`, and the backend independently asks MSG91
 * whether the access-token is genuine before any session is issued.
 *
 * @param {(session: {token: string, user: object}) => void} onVerified
 */
export default function Msg91OtpWidget({ onVerified, role, name }) {
  const [phase, setPhase] = useState('loading'); // loading|unavailable|phone|otp|busy|verified
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const reqIdRef = useRef('');
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let config;
      try {
        const res = await fetch('/api/auth/msg91/widget-config');
        config = await res.json();
      } catch {
        if (!cancelled) { setError('Could not reach the server.'); setPhase('unavailable'); }
        return;
      }

      if (!config?.enabled) {
        if (!cancelled) {
          setError(config?.reason || 'Verification is unavailable.');
          setPhase('unavailable');
        }
        return;
      }

      if (!window.initSendOTP) {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = WIDGET_SRC;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('load failed'));
            document.body.appendChild(script);
          });
        } catch {
          if (!cancelled) { setError('Could not load the verification service.'); setPhase('unavailable'); }
          return;
        }
      }

      if (cancelled) return;

      window.initSendOTP({
        widgetId: config.widgetId,
        tokenAuth: config.tokenAuth,
        identifier: '',
        exposeMethods: true, // exposes sendOtp/retryOtp/verifyOtp; hides MSG91's popup
        captchaRenderId: '',
        // Per-call callbacks below handle outcomes. Registering these too would
        // double-report, which MSG91 explicitly warns against.
        success: () => {},
        failure: () => {},
      });

      readyRef.current = true;
      setPhase('phone');
    })();

    return () => { cancelled = true; };
  }, []);
  const sendOtp = useCallback(() => {
    if (!readyRef.current || typeof window.sendOtp !== 'function') {
      setError('Verification is still loading. Please try again.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setError('');
    setPhase('busy');
    window.sendOtp(
      toMsg91Identifier(`+91${mobile}`),
      (data) => {
        // reqId comes back on success and is required for retry and verify.
        reqIdRef.current = data?.message || data?.reqId || '';
        setOtp('');
        setPhase('otp');
      },
      (err) => { setError(readError(err)); setPhase('phone'); },
    );
  }, [mobile]);

  const retryOtp = useCallback((channel = null) => {
    if (typeof window.retryOtp !== 'function') return;
    setError('');
    setPhase('busy');
    window.retryOtp(
      channel,
      () => { setOtp(''); setPhase('otp'); },
      (err) => { setError(readError(err)); setPhase('otp'); },
      reqIdRef.current || undefined,
    );
  }, []);

  const verifyOtp = useCallback(() => {
    if (typeof window.verifyOtp !== 'function') return;
    if (!/^\d{4,8}$/.test(otp)) {
      setError('Enter the code you received.');
      return;
    }

    setError('');
    setPhase('busy');
    window.verifyOtp(
      otp,
      async (data) => {
        // `data` carries a JWT access-token. Our backend re-validates it with
        // MSG91 before any session is issued - the client is never the authority.
        const accessToken = data?.message || data?.accessToken || '';
        try {
          const res = await fetch('/api/auth/msg91/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken,
              ...(role ? { role } : {}),
              ...(name ? { name } : {}),
            }),
          });
          const body = await res.json();
          if (!res.ok || !body.success) {
            setError(body.message || 'Verification failed.');
            setPhase('otp');
            return;
          }
          setPhase('verified');
          onVerified?.(body);
        } catch {
          setError('Could not reach the server.');
          setPhase('otp');
        }
      },
      (err) => { setError(readError(err)); setPhase('otp'); },
      reqIdRef.current || undefined,
    );
  }, [otp, role, name, onVerified]);

  if (phase === 'unavailable') {
    return <div className="rm-hint">{error || 'Verification is unavailable.'}</div>;
  }

  const busy = phase === 'busy';

  return (
    <div className="rm-msg91">
      {error && <div className="rm-error">{error}</div>}

      {phase !== 'otp' && phase !== 'busy' && (
        <form onSubmit={(e) => { e.preventDefault(); sendOtp(); }}>
          <label>Mobile Number</label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="9000000010"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          <button className="rm-btn rm-btn--primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send OTP'}
          </button>
        </form>
      )}

      {(phase === 'otp' || (busy && reqIdRef.current)) && (
        <form onSubmit={(e) => { e.preventDefault(); verifyOtp(); }}>
          <label>Enter Verification Code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
          />
          <small>OTP sent to +91 {mobile}</small>
          <button className="rm-btn rm-btn--primary" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify OTP'}
          </button>
          <button
            type="button"
            className="rm-btn rm-btn--outline"
            disabled={busy}
            onClick={() => retryOtp(null)}
          >
            Resend OTP
          </button>
          <button
            type="button"
            className="rm-entry-back"
            onClick={() => { reqIdRef.current = ''; setOtp(''); setError(''); setPhase('phone'); }}
          >
            Use a different number
          </button>
        </form>
      )}

      {phase === 'loading' && <p className="rm-hint">Loading verification…</p>}
      {phase === 'verified' && <p className="rm-hint">Verified.</p>}
    </div>
  );
}
