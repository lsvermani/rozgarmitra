import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: '📊 Dashboard', end: true },
  { to: '/users', label: '👥 Users' },
  { to: '/jobs', label: '📋 Jobs' },
  { to: '/reports', label: '🚩 Reports' },
  { to: '/preview', label: '🎭 Product Preview' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const visibleLinks = user?.role === 'job_creator' ? links.filter((link) => link.to === '/') : links;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="rm-app">
      <aside className="rm-sidebar">
        <div className="rm-sidebar__brand">
          ROZGAR<span>MITRA</span>
          <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 4 }}>Admin Panel</div>
        </div>
        <nav>
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => 'rm-nav-link' + (isActive ? ' active' : '')}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="rm-main">
        <div className="rm-topbar">
          <h1 />
          <div className="rm-topbar__user">
            <span>👤 {user?.name || 'Admin'} ({user?.mobile})</span>
            <button className="rm-btn rm-btn--outline" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
