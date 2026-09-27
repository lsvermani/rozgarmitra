import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import LanguageTabs from '../components/LanguageTabs';
import { useLanguage } from '../context/useLanguage';

export default function LoginRM() {
  const [name, setName] = useState(() => localStorage.getItem('rm_pending_name') || '');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t } = useLanguage();

  const submit = (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError(t('nameError'));
      return;
    }
    localStorage.setItem('rm_pending_name', trimmedName);
    navigate('/entrywork');
  };

  return (
    <main className="rm-login-rm-page">
      <LanguageTabs />
      <div className="rm-login-rm-shell">
        <header className="rm-login-rm-brand">
          <div className="rm-login-rm-logo"><BrandMark size={34} />ROZGAR<span>MITRA</span></div>
          <span>Local work. Real opportunity.</span>
        </header>
        <section className="rm-login-rm-content">
          <div className="rm-login-rm-copy">
            <h1>{t('welcomeTitle')}</h1>
            <p>{t('welcomeSubtitle')}</p>
            <div className="rm-login-rm-points">
              <span>01&nbsp; {t('welcomePointOne')}</span>
              <span>02&nbsp; {t('welcomePointTwo')}</span>
              <span>03&nbsp; {t('welcomePointThree')}</span>
            </div>
          </div>
          <form className="rm-login-rm-card" onSubmit={submit}>
            <span className="rm-entry-kicker">{t('firstStep')}</span>
            <h2>{t('nameTitle')}</h2>
            <p>{t('nameSubtitle')}</p>
            <label htmlFor="rm-name">{t('yourName')}</label>
            <input
              id="rm-name"
              autoFocus
              value={name}
              onChange={(event) => { setName(event.target.value); setError(''); }}
              placeholder={t('namePlaceholder')}
              maxLength={60}
            />
            {error && <div className="rm-error">{error}</div>}
            <button className="rm-btn rm-btn--primary" type="submit">{t('continue')}</button>
            <small>{t('nameNote')}</small>
          </form>
        </section>
      </div>
    </main>
  );
}
