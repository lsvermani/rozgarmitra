import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLE_COPY = {
  worker: {
    eyebrow: 'WORKER ACCESS',
    title: 'Find work that fits your day.',
    subtitle: 'Browse local tasks and accept the right opportunity.',
    label: 'Worker mobile number',
    placeholder: '9000000010',
    demo: 'Demo worker: 9000000010',
    action: 'Open worker dashboard',
  },
  job_creator: {
    eyebrow: 'JOB CREATOR ACCESS',
    title: 'Build your team for today.',
    subtitle: 'Post a task and connect with reliable local workers.',
    label: 'Job creator mobile number',
    placeholder: '9000000020',
    demo: 'Demo creator: 9000000020',
    action: 'Open creator dashboard',
  },
};

export default function EntryWork() {
  const [role, setRole] = useState('worker');
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const copy = ROLE_COPY[role];

  const switchRole = (nextRole) => {
    setRole(nextRole);
    setStep('mobile');
    setMobile('');
    setOtp('');
    setDemoOtp('');
    setError('');
  };

  const sendOtp = async (event) => {
    event.preventDefault();
    setError('');
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      const response = await authApi.sendOtp(mobile, role);
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

  const verifyOtp = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authApi.verifyOtp(mobile, otp);
      if (response.data.user.role !== role) {
        setError(`This account is not a ${role === 'worker' ? 'worker' : 'job creator'} account.`);
        return;
      }
      login(response.data.token, response.data.user);
      navigate(role === 'worker' ? '/worker' : '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rm-entry-page rm-entry-page--${role}`}>
      <div className="rm-entry-shell">
        <div className="rm-entry-brand">ROZGAR<span>MITRA</span></div>
        <div className="rm-entry-layout">
          <section className="rm-entry-story">
            <span className="rm-entry-kicker">ENTRYWORK</span>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
            <div className="rm-entry-points"><span>✓ Local opportunities</span><span>✓ Direct connection</span><span>✓ Trusted profiles</span></div>
          </section>

          <section className="rm-entry-card">
            <div className="rm-entry-tabs" role="tablist" aria-label="Choose account type">
              <button className={role === 'worker' ? 'active' : ''} onClick={() => switchRole('worker')} role="tab" aria-selected={role === 'worker'}>Worker</button>
              <button className={role === 'job_creator' ? 'active' : ''} onClick={() => switchRole('job_creator')} role="tab" aria-selected={role === 'job_creator'}>Job creator</button>
            </div>
            <div className="rm-entry-slider"><span className={role === 'job_creator' ? 'right' : ''} /></div>
            <span className="rm-entry-kicker">{copy.eyebrow}</span>
            <h2>Sign in to continue</h2>
            {step === 'mobile' ? (
              <form onSubmit={sendOtp}>
                <label>{copy.label}</label>
                <input type="tel" placeholder={copy.placeholder} value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))} maxLength={10} />
                {error && <div className="rm-error">{error}</div>}
                <button className="rm-btn rm-btn--primary" disabled={loading}>{loading ? 'Sending...' : 'Send OTP'}</button>
                <p className="rm-hint">{copy.demo}</p>
              </form>
            ) : (
              <form onSubmit={verifyOtp}>
                <label>Enter OTP sent to {mobile}</label>
                <input type="text" placeholder="123456" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} />
                {error && <div className="rm-error">{error}</div>}
                <button className="rm-btn rm-btn--primary" disabled={loading}>{loading ? 'Verifying...' : copy.action}</button>
                {demoOtp && <p className="rm-hint">Demo mode - OTP auto-filled ({demoOtp})</p>}
              </form>
            )}
            {step === 'otp' && <button className="rm-entry-back" onClick={() => setStep('mobile')}>Use a different number</button>}
          </section>
        </div>
      </div>
    </div>
  );
}
