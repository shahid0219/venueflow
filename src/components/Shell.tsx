import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDate } from '../format';

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { prefs } = usePrefs();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'VenueFlow — Event Operations';
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">VF</div>
          <div className="brand-text">
            <span className="brand-name">VenueFlow</span>
            <span className="brand-tag">Operations</span>
          </div>
        </div>

        <nav className="nav-group" aria-label="Workspace">
          <span className="nav-group-label">Workspace</span>
          <NavLink to="/" end className="nav-link">
            Dashboard
          </NavLink>
          <NavLink to="/events" className="nav-link">
            Events
          </NavLink>
          <NavLink to="/venues" className="nav-link">
            Venues
          </NavLink>
          <NavLink to="/volunteers" className="nav-link">
            Volunteers
          </NavLink>
        </nav>

        <nav className="nav-group" aria-label="Operations">
          <span className="nav-group-label">Operations</span>
          <NavLink to="/shifts" className="nav-link">
            Shifts
          </NavLink>
          <NavLink to="/attendance" className="nav-link">
            Attendance
          </NavLink>
          <NavLink to="/tasks" className="nav-link">
            Tasks
          </NavLink>
          <NavLink to="/incidents" className="nav-link">
            Incidents
          </NavLink>
        </nav>

        <nav className="nav-group" aria-label="Account">
          <span className="nav-group-label">Account</span>
          <NavLink to="/reports" className="nav-link">
            Reports
          </NavLink>
          <NavLink to="/settings" className="nav-link">
            Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="avatar">{initials(user?.name ?? '')}</span>
            <div className="user-meta">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role}</span>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="tiny subtle">{formatDate(new Date().toISOString(), prefs)}</span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="topbar-title">Event operations</div>
            <div className="topbar-sub">{user?.name} · {user?.role}</div>
          </div>
          <div className="topbar-spacer" />
        </header>
        <div className="content">{children}</div>
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
