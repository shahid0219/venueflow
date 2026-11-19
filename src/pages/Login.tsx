import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { Button, Field, FormError, Icon, LoadingBlock, Select, TextInput } from '../ui';
import type { Role } from '../types';

type Mode = 'login' | 'register';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@venueflow.app' },
  { role: 'Coordinator', email: 'coordinator@venueflow.app' },
  { role: 'Volunteer', email: 'volunteer@venueflow.app' },
];

export default function Login() {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('volunteer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <LoadingBlock label="Checking your session…" />
      </div>
    );
  }

  if (user) return <Navigate to={redirectTo} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register({ name: name.trim(), email: email.trim(), password, role });
      }
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function useDemoAccount(demoEmail: string) {
    setMode('login');
    setEmail(demoEmail);
    setPassword('Demo1234!');
    setError(null);
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="auth-aside-inner">
          <div className="row" style={{ gap: 12 }}>
            <div className="brand-mark">VF</div>
            <div className="brand-text">
              <span className="brand-name">VenueFlow</span>
              <span className="brand-tag">Operations</span>
            </div>
          </div>

          <h1 className="auth-headline">
            Every venue, shift and <span>volunteer</span> in one operational view.
          </h1>
          <p className="auth-copy">
            VenueFlow keeps event teams aligned: publish events, schedule shifts with automatic
            conflict detection, track attendance, and close out incidents — all backed by one
            database.
          </p>

          <div className="auth-features">
            {[
              'Live dashboard driven by your own records',
              'Overlapping-shift detection before you assign',
              'Attendance, tasks and incidents in one timeline',
              'CSV exports for reporting and handover',
            ].map((item) => (
              <div className="auth-feature" key={item}>
                <Icon name="check-circle" size={16} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="auth-foot">
          Sessions are stored server-side with hashed passwords. Your credentials never leave your
          own deployment.
        </p>
      </aside>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              Create account
            </button>
          </div>

          <h2 style={{ marginBottom: 6 }}>
            {mode === 'login' ? 'Welcome back' : 'Join your operations team'}
          </h2>
          <p className="muted small" style={{ marginBottom: 18 }}>
            {mode === 'login'
              ? 'Sign in with the email and password for your VenueFlow account.'
              : 'Create a real account. You choose your role — coordinators can manage records.'}
          </p>

          <FormError message={error} />

          <form onSubmit={submit}>
            {mode === 'register' ? (
              <>
                <Field label="Full name" htmlFor="name" required>
                  <TextInput
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Jordan Blake"
                    autoComplete="name"
                    required
                    minLength={2}
                  />
                </Field>
                <Field label="Role" htmlFor="role" hint="Coordinators, organisers and admins can manage records.">
                  <Select id="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
                    <option value="volunteer">Volunteer</option>
                    <option value="coordinator">Coordinator</option>
                    <option value="organizer">Organiser</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>
              </>
            ) : null}

            <Field label="Email" htmlFor="email" required>
              <TextInput
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@venueflow.app"
                autoComplete="email"
                required
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              required
              hint={mode === 'register' ? 'At least 8 characters.' : undefined}
            >
              <TextInput
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 8 : 1}
              />
            </Field>

            <Button type="submit" variant="primary" disabled={busy} className="btn-block">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="auth-note">
            <strong>Demo data is seeded in this deployment.</strong> Sign in with{' '}
            <code className="mono">Demo1234!</code> for:
            <div className="stack-sm" style={{ marginTop: 8 }}>
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="btn btn-sm"
                  onClick={() => useDemoAccount(account.email)}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span>{account.role}</span>
                  <span className="mono subtle">{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
