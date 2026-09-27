import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuth } from '../context/useAuth';
import BrandMark from '../components/BrandMark';

export default function WorkerLogin() {
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoOtp, setDemoOtp] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSendOtp = async (event) => {
    event.preventDefault();
    setError('');
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      const response = await authApi.sendOtp(mobile, 'worker');
      if (response.data.demoOtp) {
        setDemoOtp(response.data.demoOtp);
        setOtp(response.data.demoOtp);
      }
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authApi.verifyOtp(mobile, otp, 'worker');
      if (response.data.user.role !== 'worker') {
        setError('This account is not a worker account.');
        return;
      }
      login(response.data.token, response.data.user);
      navigate('/worker');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rm-login-page rm-login-page--worker">
      <div className="rm-login-box">
        <div className="rm-login-mark">WORKER HUB</div>
        <h1 className="rm-login-title"><BrandMark size={40} />Rozgarmitra</h1>
        <p className="tagline">Find nearby work. Apply in one tap.</p>

        {step === 'mobile' && (
          <form onSubmit={handleSendOtp}>
            <label>Worker mobile number</label>
            <input
              type="tel"
              placeholder="9000000010"
              value={mobile}
              onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
            />
            {error && <div className="rm-error">{error}</div>}
            <button className="rm-btn rm-btn--primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
            <p className="rm-hint">Demo worker: 9000000010</p>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <label>Enter OTP sent to {mobile}</label>
            <input
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
            />
            {error && <div className="rm-error">{error}</div>}
            <button className="rm-btn rm-btn--primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Open worker dashboard'}
            </button>
            {demoOtp && <p className="rm-hint">Demo mode - OTP auto-filled ({demoOtp})</p>}
          </form>
        )}
      </div>
    </div>
  );
}
