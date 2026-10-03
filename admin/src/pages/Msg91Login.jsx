import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import Msg91OtpWidget from '../components/Msg91OtpWidget';
import BrandMark from '../components/BrandMark';
import { PublicShell } from './PublicApp';

/**
 * MSG91 OTP Widget sign-in.
 *
 * Kept on its own route rather than merged into `/entrywork`, so the existing SMS
 * and Firebase login is completely untouched. If MSG91 is disabled or
 * unconfigured the widget renders its "unavailable" reason and the user simply
 * goes back - nothing breaks.
 */
export default function Msg91Login() {
  const [role] = useState('worker');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleVerified = (session) => {
    // Same envelope as every other auth path, so `login()` behaves identically.
    login(session.token, session.user);
    const needsProfile = !session.user?.name;
    if (needsProfile) navigate('/profile-setup');
    else navigate(session.user?.role === 'worker' ? '/worker' : '/admin');
  };

  return (
    <PublicShell>
      <div className="rm-login-box">
        <h1 className="rm-login-title"><BrandMark size={40} />Rozgarmitra</h1>
        <p className="tagline">Verify your number with WhatsApp</p>
        <Msg91OtpWidget role={role} onVerified={handleVerified} />
        <p className="rm-login-switch">
          <a href={`${import.meta.env.BASE_URL}entrywork`}>Use SMS instead</a>
        </p>
      </div>
    </PublicShell>
  );
}