import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminOtpApi } from '../api/client';
import { useAuth } from '../context/useAuth';
import BrandMark from '../components/BrandMark';
import LanguageTabs from '../components/LanguageTabs';

/** Digits only. The server is the authority; this just keeps the input sane. */
const digitsOnly = (value, max) => String(value).replace(/\D/g, '').slice(0, max);

const RESEND_FALLBACK_SECONDS = 60;

export default function Login() {
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [phone, setPhone] = useState('');
  // One digit per box. A single real input underneath keeps native autofill,
  // paste and the on-screen numeric keypad working; the boxes are a view of it.
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // Drives the focus ring on the OTP boxes. Without it there is no visual
  // feedback that the hidden input has focus, so a click that failed to focus
  // looks identical to a field that is working.
  const [otpFocused, setOtpFocused] = useState(false);
  const otpInputRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Resend countdown. Kept server-authoritative: the server returns
  // `resendAfterSeconds` *and* rejects an early request, so shortening this
  // timer in devtools cannot actually make a resend succeed.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  /** Shared by "Send OTP" and "Resend OTP" - identical request, identical errors. */
  const sendOtp = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await adminOtpApi.requestOtp(phone);
      setNotice(res.data.message || 'OTP sent successfully to your registered mobile number.');
      setOtp('');
      setStep('otp');
      setResendIn(Number(res.data.resendAfterSeconds) || RESEND_FALLBACK_SECONDS);
    } catch (err) {
      // A cooldown rejection is not something the user can fix by retrying, so
      // the countdown restarts from the value the server reports.
      const data = err.response?.data || {};
      if (data.retryAfterSeconds) setResendIn(Number(data.retryAfterSeconds));
      setError(data.message || 'Unable to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = (e) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError('Please enter the registered Admin mobile number.');
      return;
    }
    sendOtp();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp)) {
      setError('Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const res = await adminOtpApi.verifyOtp(phone, otp);
      login(res.data.token, res.data.user);
      navigate('/admin');
    } catch (err) {
      const data = err.response?.data || {};
      setError(data.message || 'Invalid OTP. Please try again.');
      // An expired or fully-spent code cannot be recovered by guessing again,
      // so clear the boxes and let them request a new one.
      if (['otp_expired', 'too_many_attempts', 'no_otp', 'otp_used'].includes(data.errorCode)) {
        setOtp('');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetToPhone = () => {
    setStep('phone');
    setError('');
    setNotice('');
    setOtp('');
  };

  return (
    <div className="rm-login-page">
      <LanguageTabs />
      <div className="rm-login-box">
        <h1 className="rm-login-title"><BrandMark size={40} />Rozgar<span className="rm-login-title__accent">Mitra</span></h1>
        <p className="tagline">Super Admin login &mdash; platform control center</p>

        {step === 'phone' && (
          <form onSubmit={handleSendOtp}>
            <label htmlFor="rm-admin-phone">Admin Mobile Number</label>
            <input
              id="rm-admin-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="Enter 10-digit mobile number"
              value={phone}
              onChange={(e) => setPhone(digitsOnly(e.target.value, 10))}
              maxLength={10}
              disabled={loading}
            />
            {error && <div className="rm-error" role="alert">{error}</div>}
            <button className="rm-btn rm-btn--primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
            <p className="rm-login-switch">
              Looking for work? <a href={`${import.meta.env.BASE_URL}entrywork`}>Worker/Job Creator Sign in</a>
            </p>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <label htmlFor="rm-admin-otp">Enter OTP sent to {phone}</label>
            {/* The real input. Visually hidden but focusable, so autofill,
                paste and the numeric keypad all behave normally. The six
                boxes below render its value - they are not six separate
                inputs, which would break paste and focus order. */}
            <input
              ref={otpInputRef}
              id="rm-admin-otp"
              name="otp"
              className="rm-otp-native"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Enter the 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(digitsOnly(e.target.value, 6))}
              onFocus={() => setOtpFocused(true)}
              onBlur={() => setOtpFocused(false)}
              maxLength={6}
              disabled={loading}
            />
            {/* Clicking the boxes is what a person actually does, and the real input
                is 1px wide - so without this handler focus lands on <body> and
                every keystroke goes nowhere. Proven with a real keystroke test:
                click-then-type entered nothing until the input was focused first.
                focus() runs on click so it fires for mouse, pen and touch alike;
                pointerdown would miss some assistive and synthetic input.
                The spans stay aria-hidden: they are decoration, and the input
                above is the real control. */}
            <div
              className={`rm-otp-boxes${otpFocused ? ' rm-otp-boxes--focused' : ''}`}
              role="presentation"
              onClick={() => otpInputRef.current?.focus()}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`rm-otp-box${otp[i] ? ' rm-otp-box--filled' : ''}${(otpFocused && i === otp.length) ? ' rm-otp-box--active' : ''}`}
                >
                  {otp[i] || ''}
                </span>
              ))}
            </div>
            {notice && <div className="rm-ok" role="status">{notice}</div>}
            {error && <div className="rm-error" role="alert">{error}</div>}
            <button className="rm-btn rm-btn--primary" disabled={loading || otp.length !== 6}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <button
              type="button"
              className="rm-btn rm-btn--outline"
              onClick={sendOtp}
              disabled={resendIn > 0 || loading}
            >
              {resendIn > 0 ? `Resend OTP in ${resendIn}s` : 'Resend OTP'}
            </button>
            <p className="rm-login-switch">
              <button type="button" className="rm-linkbtn" onClick={resetToPhone}>
                Change number
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
