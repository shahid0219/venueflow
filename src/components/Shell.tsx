import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDate } from '../format';
import { Icon, type IconName } from '../ui';

type NavItem = { to: string; label: string; icon: IconName };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: 'dashboard' },
      { to: '/events', label: 'Events', icon: 'calendar' },
      { to: '/venues', label: 'Venues', icon: 'building' },
      { to: '/volunteers', label: 'Volunteers', icon: 'users' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/shifts', label: 'Shifts', icon: 'clock' },
      { to: '/attendance', label: 'Attendance', icon: 'check-circle' },
      { to: '/tasks', label: 'Tasks', icon: 'clipboard' },
      { to: '/incidents', label: 'Incidents', icon: 'alert' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/reports', label: 'Reports', icon: 'chart' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

const SECTION_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/events': 'Events',
  '/venues': 'Venues',
  '/volunteers': 'Volunteers',
  '/shifts': 'Shifts & scheduling',
  '/attendance': 'Attendance',
  '/tasks': 'Tasks',
  '/incidents': 'Incidents',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { prefs } = usePrefs();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.title = 'VenueFlow — Event Operations';
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const section = SECTION_LABELS[location.pathname] ?? 'Workspace';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      {drawerOpen ? (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      ) : null}

      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            VF
          </div>
          <div className="brand-text">
            <span className="brand-name">VenueFlow</span>
            <span className="brand-tag">Operations</span>
          </div>
        </div>

        {NAV_GROUPS.map((group) => (
          <nav className="nav-group" aria-label={group.label} key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">
                  <Icon name={item.icon} size={15} />
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        ))}

        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="avatar">{initials(user?.name ?? '')}</span>
            <div className="user-meta">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role}</span>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="tiny subtle numeric">{formatDate(new Date().toISOString(), prefs)}</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              <Icon name="logout" size={13} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-label="Toggle navigation"
            aria-expanded={drawerOpen}
          >
            <Icon name={drawerOpen ? 'x' : 'menu'} size={16} />
          </button>
          <div>
            <div className="topbar-title">{section}</div>
            <div className="topbar-sub">
              {user?.name} · <span style={{ textTransform: 'capitalize' }}>{user?.role}</span>
            </div>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-meta">
            <span className="crumb">
              <Icon name="shield" size={13} />
              Secure session
              <span className="crumb-sep">/</span>
              <span className="numeric">{formatDate(new Date().toISOString(), prefs)}</span>
            </span>
          </div>
        </header>
        <div className="content" id="main-content">
          {children}
        </div>
      </main>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
