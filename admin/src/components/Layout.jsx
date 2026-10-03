import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useLanguage } from '../context/useLanguage';
import BrandMark from './BrandMark';
import LanguageTabs from './LanguageTabs';
import LiveLocation from './LiveLocation';

const links = [
  { to: '/admin/applications', label: 'Applications' },
  { to: '/admin/logs', label: 'ðŸ“œ Activity Logs' },
  { to: '/admin/otp-verifications', label: 'OTP Verification Log' },
  { to: '/admin/whatsapp', label: 'ðŸ’¬ WhatsApp OTP' },
  { to: '/admin', label: 'ðŸ“Š Dashboard', end: true },
  { to: '/admin/users', label: 'ðŸ‘¥ Users' },
  { to: '/admin/jobs', label: 'ðŸ“‹ Jobs' },
  { to: '/admin/reports', label: 'ðŸš© Reports' },
  { to: '/admin/preview', label: 'ðŸŽ­ Task Preview' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const sidebarSubtitle = user?.role === 'job_creator'
    ? `Welcome, ${user?.name || 'Job Creator'}`
    : t('adminPanel');
  const visibleLinks = user?.role === 'job_creator' ? links.filter((link) => link.to === '/admin') : links;
  const labels = { '/admin': t('dashboard'), '/admin/users': t('users'), '/admin/jobs': t('jobs'), '/admin/applications': 'Applications', '/admin/logs': 'Activity Logs', '/admin/otp-verifications': 'OTP Verification Log', '/admin/whatsapp': 'WhatsApp OTP', '/admin/sms-gateway': 'SMS Gateway', '/admin/reports': t('reports'), '/admin/preview': t('preview') };

  const handleLogout = () => {
    const destination = user?.role === 'admin' ? '/login' : '/entrywork';
    logout();
    navigate(destination, { replace: true });
  };

  return (
    <div className="rm-app">
      <LanguageTabs showLocation={false} />
      <aside className="rm-sidebar">
        <div className="rm-sidebar__brand">
          <span className="rm-sidebar__logo"><BrandMark size={30} />ROZGAR<span>MITRA</span></span>
          <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 4 }}>{sidebarSubtitle}</div>
        </div>
        <nav>
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => 'rm-nav-link' + (isActive ? ' active' : '')}
            >
              {labels[l.to]}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="rm-main">
        <div className="rm-topbar">
          <h1 />
          <div className="rm-topbar__user">
            <LiveLocation className="rm-location--admin" />
            <span>ðŸ‘¤ {user?.name || 'Admin'} ({user?.mobile})</span>
            <button className="rm-btn rm-btn--outline" onClick={handleLogout}>{t('logout')}</button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

