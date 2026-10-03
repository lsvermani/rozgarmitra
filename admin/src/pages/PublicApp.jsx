import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import LanguageTabs from '../components/LanguageTabs';
import { LANGUAGES, useLanguage } from '../context/useLanguage';
import { useLocation as useLiveLocation } from '../context/useLocation';
import { categories, mockJobs } from '../data/jobsData';

const whatsappUrl = 'https://wa.me/918699142699';
const heroImage = `${import.meta.env.BASE_URL}img/hero.jpg`;

/**
 * Shared site chrome for every public route AND the /entrywork sign-in page,
 * so the whole experience looks like one continuous site.
 */
export function PublicShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  // Hide the call-to-action on the page it links to, so the button never
  // points at the screen the visitor is already on.
  const isEntryWork = location.pathname === '/entrywork';
  return <div className="rm-public-app">
    <header className="rm-public-header">
      <Link to="/" className="rm-public-logo"><span className="rm-public-logo__mark"><BrandMark size={34} />ROZGAR<span>MITRA</span></span><small>{t('tagline')}</small></Link>
      <nav className="rm-public-header__tools">
        {!isEntryWork && (
          <Link to="/entrywork" className="rm-public-authlink">
            <span aria-hidden="true">👤</span>
            {t('signUpLogin')}
          </Link>
        )}
        <LanguageTabs />
      </nav>
    </header>
    {children}
    <PublicFooter />
    <nav className="rm-public-bottom-nav">
      <button onClick={() => navigate('/')} type="button">🏠<span>{t('navHome')}</span></button>
      <a href={whatsappUrl} target="_blank" rel="noreferrer">💬<span>{t('navMessageAdmin')}</span></a>
      <button onClick={() => navigate('/contact')} type="button">📞<span>{t('navContactUs')}</span></button>
    </nav>
  </div>;
}

export default function PublicApp() {
  const location = useLocation();
  const path = location.pathname;
  if (path === '/find-work') return <FindWork />;
  if (path === '/register') return <WorkerRegistration />;
  if (path.startsWith('/job/')) return <JobDetails />;
  if (path === '/terms') return <InfoPage titleKey="termsTitle"><TermsContent /></InfoPage>;
  if (path === '/privacy') return <InfoPage titleKey="privacyTitle"><PrivacyContent /></InfoPage>;
  if (path === '/contact') return <InfoPage titleKey="contactTitle"><ContactContent /></InfoPage>;
  return <Home />;
}

function Home() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [category, setCategory] = useState('');
  const jobs = useMemo(() => category ? mockJobs.filter((job) => job.category === category) : mockJobs, [category]);
  return <PublicShell>
    <main>
      <section className="rm-public-hero">
        <img className="rm-public-hero__bg" src={heroImage} alt="A rural couple standing at the doorway of their village home" />
        <span className="rm-public-hero__scrim" aria-hidden="true" />
        <div className="rm-public-hero__copy"><span className="rm-public-kicker">ROZGARMITRA</span><h1>{t('heroLine1')}<br /><em>{t('heroLine2')}</em></h1><p>{t('heroLead')}</p><div className="rm-public-hero__actions"><button className="rm-public-btn rm-public-btn--primary" onClick={() => navigate('/find-work')}>🔍 {t('heroFindWork')}</button><button className="rm-public-btn rm-public-btn--light" onClick={() => navigate('/register')}>📝 {t('heroRegister')}</button></div></div>
        <div className="rm-hero-note">{t('heroNote')}</div>
      </section>
      <section className="rm-public-section"><div className="rm-public-section__heading"><span className="rm-public-kicker">{t('chooseKicker')}</span><h2>{t('chooseTitle')}</h2></div><CategoryGrid selected={category} onSelect={setCategory} /></section>
      <section className="rm-public-section rm-public-section--jobs"><div className="rm-public-section__heading"><span className="rm-public-kicker">{t('nearbyKicker')}</span><h2>{t('nearbyTitle')}</h2><p>{t('nearbySub')}</p></div><JobGrid jobs={jobs} /></section>
    </main>
  </PublicShell>;
}

function FindWork() {
  const [category, setCategory] = useState('');
  const { t } = useLanguage();
  const jobs = category ? mockJobs.filter((job) => job.category === category) : mockJobs;
  return <PublicShell><main className="rm-public-section rm-public-page"><span className="rm-public-kicker">{t('findKicker')}</span><h1>{t('findTitle')}</h1><p className="rm-public-lead">{t('findLead')}</p><CategoryGrid selected={category} onSelect={setCategory} /><JobGrid jobs={jobs} /></main></PublicShell>;
}

function CategoryGrid({ selected, onSelect }) {
  const { tCategory } = useLanguage();
  return <div className="rm-category-grid">{categories.map((item) => <button key={item.name} className={`rm-category-card ${selected === item.name ? 'selected' : ''}`} onClick={() => onSelect(selected === item.name ? '' : item.name)} type="button"><span>{item.icon}</span><strong>{tCategory(item.name)}</strong></button>)}</div>;
}
function JobGrid({ jobs }) {
  const { t } = useLanguage();
  return jobs.length ? <div className="rm-public-job-grid">{jobs.map((job) => <JobCard key={job.id} job={job} />)}</div> : <div className="rm-public-empty">{t('noJobs')}</div>;
}
function JobCard({ job }) {
  const { t, tCategory } = useLanguage();
  return <article className="rm-public-job-card"><div className="rm-public-job-card__top"><span className="rm-public-pill">{tCategory(job.category)}</span><span>{job.distance}</span></div><h3>{job.title}</h3><p>{job.description}</p><div className="rm-public-job-card__meta"><span>📍 {job.location}</span><strong>{job.payment}</strong><span>🕘 {job.hours}</span></div><Link className="rm-public-btn rm-public-btn--primary" to={`/job/${job.id}`}>{t('viewJob')}</Link></article>;
}

function JobDetails() {
  const { id } = useParams();
  const { t, tCategory } = useLanguage();
  const job = mockJobs.find((item) => item.id === id) || mockJobs[0];
  return <PublicShell><main className="rm-public-section rm-public-page"><Link className="rm-public-back" to="/find-work">← {t('backToJobs')}</Link><span className="rm-public-pill">{tCategory(job.category)}</span><h1>{job.title}</h1><p className="rm-public-lead">{job.description}</p><div className="rm-job-detail-card"><div><span>📍 {job.location}</span><span>📏 {job.distance}</span><span>🕘 {job.hours}</span></div><strong>{job.payment}</strong><p>{t('verifyNote')}</p><a className="rm-public-btn rm-public-btn--primary" href={whatsappUrl} target="_blank" rel="noreferrer">💬 {t('askAdmin')}</a></div></main></PublicShell>;
}

function WorkerRegistration() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({});
  const { t, tCategory, language } = useLanguage();
  const { location, status, detect } = useLiveLocation();
  const update = (key, value) => setForm({ ...form, [key]: value });
  // Pre-fill the location field with the detected live locality, but let the
  // worker override it by typing.
  const locationValue = form.location || location?.label || '';
  return <PublicShell><main className="rm-public-section rm-public-page">
    <span className="rm-public-kicker">{t('regKicker')}</span>
    <h1>{t('regTitle')}</h1>
    <p className="rm-public-lead">{t('regLead')}</p>
    {submitted ? <div className="rm-public-success">{t('regSuccess')}</div> : <form className="rm-public-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
      <label>{t('fullName')}<input required value={form.name || ''} onChange={(e) => update('name', e.target.value)} /></label>
      <label>{t('mobileNumber')}<input required pattern="[6-9][0-9]{9}" inputMode="numeric" value={form.mobile || ''} onChange={(e) => update('mobile', e.target.value)} /></label>
      <label>{t('preferredLanguage')}<select value={form.language || language} onChange={(e) => update('language', e.target.value)}>{LANGUAGES.map((item) => <option key={item.code} value={item.label}>{item.label}</option>)}</select></label>
      <label>{t('yourLocation')}<span className="rm-field-with-action"><input required value={locationValue} onChange={(e) => update('location', e.target.value)} placeholder={t('detectLocation')} /><button type="button" className="rm-field-action" onClick={detect} disabled={status === 'loading'}>{status === 'loading' ? '…' : '📍'}</button></span></label>
      <label>{t('workCategory')}<select required value={form.category || ''} onChange={(e) => update('category', e.target.value)}><option value="">{t('selectCategory')}</option>{categories.map((item) => <option key={item.name} value={item.name}>{tCategory(item.name)}</option>)}</select></label>
      <label>{t('skills')}<textarea value={form.skills || ''} onChange={(e) => update('skills', e.target.value)} /></label>
      <div className="rm-form-row"><label>{t('experience')}<input type="number" min="0" value={form.experience || ''} onChange={(e) => update('experience', e.target.value)} /></label><label>{t('expectedWage')}<input type="number" min="0" value={form.wage || ''} onChange={(e) => update('wage', e.target.value)} /></label></div>
      <label>{t('availability')}<input placeholder={t('availabilityHint')} value={form.availability || ''} onChange={(e) => update('availability', e.target.value)} /></label>
      <button className="rm-public-btn rm-public-btn--primary" type="submit">{t('regSubmit')}</button>
      <small>{t('regNote')}</small>
    </form>}
  </main></PublicShell>;
}

function InfoPage({ titleKey, children }) {
  const { t } = useLanguage();
  return <PublicShell><main className="rm-public-section rm-public-page rm-info-page"><span className="rm-public-kicker">ROZGARMITRA</span><h1>{t(titleKey)}</h1>{children}</main></PublicShell>;
}
function TermsContent() { return <InfoSections sections={['Acceptance of Terms', 'User Registration', 'Worker Responsibilities', 'Job Creator Responsibilities', 'Payments and Wages', 'Safety', 'Prohibited Activities', 'User Conduct', 'Account Suspension', 'Limitation of Liability', 'Changes to Terms', 'Contact Information']} />; }
function PrivacyContent() { return <InfoSections sections={['Information collected: mobile number, name, location, skills and work information.', 'How information is used: to connect workers and job creators and improve the service.', 'Data sharing: information may be shared with relevant users for a requested connection.', 'Security', 'User rights', 'Data retention', 'Contact information', 'The final policy should be reviewed against applicable Indian privacy and data-protection requirements.']} />; }
function InfoSections({ sections }) { return <div className="rm-info-list">{sections.map((section) => <section key={section}><h3>{section}</h3><p>Rozgarmitra is a platform connecting workers and job creators. Users should independently verify job details, wages, identity and working conditions. Professional legal review should be obtained before publishing final policy language.</p></section>)}</div>; }
function ContactContent() {
  const { t } = useLanguage();
  return <div className="rm-contact-grid"><div><h2>ROZGARMITRA</h2><p>{t('contactLead')}</p><a className="rm-public-btn rm-public-btn--primary" href={whatsappUrl} target="_blank" rel="noreferrer">💬 {t('contactMessage')}</a></div><div className="rm-contact-details"><p>📞 8699142699</p><p>💬 WhatsApp: 8699142699</p><p>📍 {t('contactAddress')}</p><p>📧 {t('contactEmail')}</p></div></div>;
}
function PublicFooter() {
  const { t } = useLanguage();
  return <footer className="rm-public-footer"><div><strong className="rm-public-footer__brand"><BrandMark size={26} />ROZGAR<span>MITRA</span></strong><p>{t('tagline')}</p></div><div className="rm-public-footer__links"><Link to="/">{t('navHome')}</Link><Link to="/find-work">{t('navFindWork')}</Link><Link to="/register">{t('navRegister')}</Link><Link to="/terms">{t('termsTitle')}</Link><Link to="/privacy">{t('privacyTitle')}</Link><Link to="/contact">{t('contactTitle')}</Link><Link to="/entrywork">{t('signUpLogin')}</Link><Link to="/login" className="rm-public-footer__admin">{t('adminPanel')}</Link></div><small>© 2026 Rozgarmitra. {t('footerRights')}</small></footer>;
}
