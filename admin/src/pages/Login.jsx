import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [step, setStep] = useState('mobile'); // 'mobile' | 'otp'
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoOtp, setDemoOtp] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.sendOtp(mobile);
      if (res.data.demoOtp) {
        setDemoOtp(res.data.demoOtp);
        setOtp(res.data.demoOtp); // auto-fill for demo convenience
      }
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.verifyOtp(mobile, otp);
      if (res.data.user.role !== 'admin') {
        setError('This account is not an admin account.');
        setLoading(false);
        return;
      }
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rm-login-page">
      <div className="rm-login-box">
        <h1>Rozgarmitra</h1>
        <p className="tagline">Kaam bhi, Rozgar bhi. — Admin Panel</p>

        {step === 'mobile' && (
          <form onSubmit={handleSendOtp}>
            <label>Admin Mobile Number</label>
            <input
              type="tel"
              placeholder="9999999999"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
            />
            {error && <div className="rm-error">{error}</div>}
            <button className="rm-btn rm-btn--primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
            <p className="rm-hint">Demo admin mobile: 9999999999</p>
            <p className="rm-login-switch">
              Looking for work? <a href="/worker/login">Open worker dashboard</a>
            </p>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <label>Enter OTP sent to {mobile}</label>
            <input
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
            />
            {error && <div className="rm-error">{error}</div>}
            <button className="rm-btn rm-btn--primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            {demoOtp && <p className="rm-hint">Demo mode — OTP auto-filled ({demoOtp})</p>}
          </form>
        )}
      </div>
    </div>
  );
}
