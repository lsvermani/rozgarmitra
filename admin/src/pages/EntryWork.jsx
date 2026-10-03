import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, usersApi } from '../api/client';
import { useAuth } from '../context/useAuth';
import { useLanguage } from '../context/useLanguage';
import { useLocation } from '../context/useLocation';
import { toLiveLocation } from '../utils/liveLocation';
import BrandMark from '../components/BrandMark';
import { PublicShell } from './PublicApp';
import { claimPendingName, clearPendingNames, setPendingName } from '../utils/pendingName';

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
  // 'mobile' -> 'otp' -> 'name' (brand-new accounts only) -> dashboard
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Scoped to the active role: a worker and a job creator using the same mobile
  // are two different accounts and must never share a name.
  const [pendingName, setPendingNameState] = useState(() => claimPendingName('worker'));
  // Held between the OTP step and the name step so the profile can be saved
  // before the visitor is actually signed in.
  const [pendingSession, setPendingSession] = useState(null);
  const { login } = useAuth();
  // The pill at the top of this page already resolved a position; forwarding it
  // on verification is what populates the Activity Logs "Live location" column.
  const { location } = useLocation();
  const navigate = useNavigate();
  const copy = ROLE_COPY[role];
  const { t } = useLanguage();

  // Where each role lands once registration is complete.
  const dashboardFor = (userRole) => (userRole === 'worker' ? '/worker' : '/admin');

  const switchRole = (nextRole) => {
    setRole(nextRole);
    setStep('mobile');
    setMobile('');
    setOtp('');
    setDemoOtp('');
    setError('');
    // Load only the name captured for this role. Switching tabs must not carry a
    // name that belongs to the other role.
    setPendingNameState(claimPendingName(nextRole));
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
      const response = await authApi.sendOtp(mobile, role, pendingName);
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
      const response = await authApi.verifyOtp(mobile, otp, role, pendingName, toLiveLocation(location));
      if (response.data.user.role !== role) {
        setError(`This account is not a ${role === 'worker' ? 'worker' : 'job creator'} account.`);
        return;
      }
      // A brand-new account has no name yet, so ask for it before signing the
      // visitor in. The backend reports this as `profileComplete: false`
      // (it is simply `Boolean(user.name)`), which is the same signal the
      // Android app uses to choose between its dashboard and its
      // profile-setup screen.
      if (!response.data.user.profileComplete) {
        setPendingSession({ token: response.data.token, user: response.data.user });
        setFullName(pendingName || '');
        setStep('name');
        return;
      }

      login(response.data.token, response.data.user);
      navigate(dashboardFor(role));
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Final registration step: persist the full name, then sign in.
   *
   * The session token is passed explicitly because the visitor is not signed
   * in yet, so there is nothing in localStorage for the request interceptor
   * to attach.
   */
  const saveFullName = async (event) => {
    event.preventDefault();
    setError('');
    const trimmed = fullName.trim();

    if (trimmed.length < 2) {
      setError(t('nameTooShort'));
      return;
    }
    if (!pendingSession) {
      setError('Your session expired. Please verify your number again.');
      setStep('otp');
      return;
    }

    setLoading(true);
    try {
      const response = await usersApi.updateProfile({ name: trimmed }, pendingSession.token);
      const user = response.data?.user || { ...pendingSession.user, name: trimmed };
      login(pendingSession.token, { ...user, profileComplete: true });
      setPendingSession(null);
      // Persist under this role only, then drop every pending name so a later
      // switch to the other role cannot reuse this one.
      setPendingName(role, trimmed);
      clearPendingNames();
      navigate(dashboardFor(role));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save your name. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicShell>
      <div className={`rm-entry-page rm-entry-page--${role}`}>
        <div className="rm-entry-shell">
          <div className="rm-entry-layout">
            <section className="rm-entry-story">
              <div className="rm-entry-brand"><BrandMark size={22} />Rozgar<span>Mitra</span></div>
              <h1>{t(role === 'worker' ? 'workerTitle' : 'creatorTitle')}</h1>
              <p>{t(role === 'worker' ? 'workerSubtitle' : 'creatorSubtitle')}</p>
              <div className="rm-entry-points"><span>✓ {t('local')}</span><span>✓ {t('direct')}</span><span>✓ {t('trusted')}</span></div>
              <p className="rm-entry-cta">{t('entryCta')}</p>
            </section>

            <section className="rm-entry-card">
              <div className="rm-entry-tabs" role="tablist" aria-label="Choose account type">
                <button className={role === 'worker' ? 'active' : ''} onClick={() => switchRole('worker')} role="tab" aria-selected={role === 'worker'}>{t('worker')}</button>
                <button className={role === 'job_creator' ? 'active' : ''} onClick={() => switchRole('job_creator')} role="tab" aria-selected={role === 'job_creator'}>{t('creator')}</button>
              </div>
              <div className="rm-entry-slider"><span className={role === 'job_creator' ? 'right' : ''} /></div>
              <span className="rm-entry-kicker">{t(role === 'worker' ? 'workerAccess' : 'creatorAccess')}</span>
              <h2>{t('signIn')}</h2>
              {pendingName && <div className="rm-entry-identity"><strong>{pendingName}</strong><span>{mobile ? `+91 ${mobile}` : t('mobilePending')}</span></div>}
              {step === 'mobile' ? (
                <form onSubmit={sendOtp}>
                  <label>{t(role === 'worker' ? 'workerMobile' : 'creatorMobile')}</label>
                  <input type="tel" placeholder={copy.placeholder} value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))} maxLength={10} />
                  {error && <div className="rm-error">{error}</div>}
                  <button className="rm-btn rm-btn--primary" disabled={loading}>{loading ? t('sending') : t('sendOtp')}</button>
                  <p className="rm-hint">{t(role === 'worker' ? 'demoWorker' : 'demoCreator')}</p>
                </form>
              ) : step === 'otp' ? (
                <form onSubmit={verifyOtp}>
                  <label>{t('enterOtp')} {mobile}</label>
                  <input type="text" placeholder="123456" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} />
                  {error && <div className="rm-error">{error}</div>}
                  <button className="rm-btn rm-btn--primary" disabled={loading}>{loading ? t('verifying') : t(role === 'worker' ? 'workerDashboard' : 'creatorDashboard')}</button>
                  {demoOtp && <p className="rm-hint">Demo mode - OTP auto-filled ({demoOtp})</p>}
                </form>
              ) : step === 'name' ? (
                <form onSubmit={saveFullName}>
                  <label>{t('fullName')}</label>
                  <input
                    type="text"
                    placeholder={t('fullNamePlaceholder')}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    maxLength={60}
                    autoFocus
                  />
                  <p className="rm-hint">{t('nameHint')}</p>
                  {error && <div className="rm-error">{error}</div>}
                  <button className="rm-btn rm-btn--primary" disabled={loading}>
                    {loading ? t('savingName') : t('continue')}
                  </button>
                </form>
              ) : null}

              {(step === 'otp' || step === 'name') && (
                <button
                  className="rm-entry-back"
                  onClick={() => { setStep('mobile'); setError(''); }}
                >
                  {t('differentNumber')}
                </button>
              )}
            </section>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
