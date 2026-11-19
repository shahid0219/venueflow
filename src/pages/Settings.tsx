import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { usePrefs } from '../prefs';
import {
  DATE_FORMAT_OPTIONS,
  THEME_OPTIONS,
  TIMEZONE_OPTIONS,
  formatDate,
} from '../format';
import {
  Badge,
  Button,
  Card,
  Field,
  FormError,
  PageHeader,
  Select,
  TextArea,
  TextInput,
  useToast,
} from '../ui';

export default function Settings() {
  const { user, updateProfile } = useAuth();
  const { prefs, update, reset } = usePrefs();
  const { push } = useToast();

  const [profile, setProfile] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    city: user?.city ?? '',
    skills: user?.skills ?? '',
    availability: user?.availability ?? '',
    bio: user?.bio ?? '',
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      await updateProfile({
        name: profile.name.trim(),
        phone: profile.phone.trim() || null,
        city: profile.city.trim() || null,
        skills: profile.skills.trim() || null,
        availability: profile.availability.trim() || null,
        bio: profile.bio.trim() || null,
      });
      push('Profile saved');
    } catch (caught) {
      setProfileError(caught instanceof ApiError ? caught.message : 'Unable to save your profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    if (passwords.next !== passwords.confirm) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (passwords.next.length < 8) {
      setPasswordError('Use at least 8 characters.');
      return;
    }
    setSavingPassword(true);
    try {
      // The profile endpoint updates every field it receives, so the current values are resent
      // alongside the password change to avoid clearing them.
      await api('/api/auth/profile', {
        method: 'PATCH',
        body: {
          name: user?.name ?? profile.name,
          phone: user?.phone ?? null,
          city: user?.city ?? null,
          skills: user?.skills ?? null,
          availability: user?.availability ?? null,
          bio: user?.bio ?? null,
          current_password: passwords.current,
          new_password: passwords.next,
        },
      });
      setPasswords({ current: '', next: '', confirm: '' });
      push('Password changed');
    } catch (caught) {
      setPasswordError(caught instanceof ApiError ? caught.message : 'Unable to change your password');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile, security and how dates and themes are displayed." />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card className="card-pad">
          <h2 className="section-title">Profile</h2>
          <p className="small subtle" style={{ marginBottom: 14 }}>
            Coordinators use these details to contact you about shifts.
          </p>
          <form onSubmit={saveProfile}>
            <FormError message={profileError} />
            <div className="stack-sm">
              <Field label="Full name" htmlFor="set-name" required>
                <TextInput
                  id="set-name"
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  required
                />
              </Field>
              <Field label="Email" htmlFor="set-email" hint="Contact an administrator to change your email.">
                <TextInput id="set-email" value={user?.email ?? ''} disabled />
              </Field>
              <div className="form-grid">
                <Field label="Phone" htmlFor="set-phone">
                  <TextInput
                    id="set-phone"
                    value={profile.phone}
                    onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  />
                </Field>
                <Field label="City" htmlFor="set-city">
                  <TextInput
                    id="set-city"
                    value={profile.city}
                    onChange={(event) => setProfile({ ...profile, city: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Skills" htmlFor="set-skills" hint="Comma separated.">
                <TextInput
                  id="set-skills"
                  value={profile.skills}
                  onChange={(event) => setProfile({ ...profile, skills: event.target.value })}
                />
              </Field>
              <Field label="Availability" htmlFor="set-availability">
                <TextInput
                  id="set-availability"
                  value={profile.availability}
                  onChange={(event) => setProfile({ ...profile, availability: event.target.value })}
                />
              </Field>
              <Field label="Notes" htmlFor="set-bio">
                <TextArea
                  id="set-bio"
                  value={profile.bio}
                  onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
                />
              </Field>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button variant="primary" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? 'Saving…' : 'Save profile'}
                </Button>
              </div>
            </div>
          </form>
        </Card>

        <div className="stack">
          <Card className="card-pad">
            <h2 className="section-title">Appearance &amp; locale</h2>
            <p className="small subtle" style={{ marginBottom: 14 }}>
              Stored in this browser only. Dates across VenueFlow use these settings.
            </p>
            <div className="stack-sm">
              <Field label="Theme" htmlFor="set-theme">
                <Select
                  id="set-theme"
                  value={prefs.theme}
                  onChange={(event) => update({ theme: event.target.value as typeof prefs.theme })}
                >
                  {THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Timezone" htmlFor="set-timezone">
                <Select
                  id="set-timezone"
                  value={prefs.timezone}
                  onChange={(event) => update({ timezone: event.target.value })}
                >
                  {TIMEZONE_OPTIONS.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date format" htmlFor="set-date-format">
                <Select
                  id="set-date-format"
                  value={prefs.dateFormat}
                  onChange={(event) =>
                    update({ dateFormat: event.target.value as typeof prefs.dateFormat })
                  }
                >
                  {DATE_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="tiny subtle">
                  Preview: {formatDate(new Date().toISOString(), prefs)}
                </span>
                <Button variant="ghost" onClick={reset}>
                  Reset to defaults
                </Button>
              </div>
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="section-title">Change password</h2>
            <form onSubmit={savePassword}>
              <FormError message={passwordError} />
              <div className="stack-sm">
                <Field label="Current password" htmlFor="set-current" required>
                  <TextInput
                    id="set-current"
                    type="password"
                    value={passwords.current}
                    onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Field label="New password" htmlFor="set-next" required hint="At least 8 characters.">
                  <TextInput
                    id="set-next"
                    type="password"
                    value={passwords.next}
                    onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>
                <Field label="Confirm new password" htmlFor="set-confirm" required>
                  <TextInput
                    id="set-confirm"
                    type="password"
                    value={passwords.confirm}
                    onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button variant="primary" onClick={savePassword} disabled={savingPassword}>
                    {savingPassword ? 'Updating…' : 'Update password'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          <Card className="card-pad">
            <h2 className="section-title">Account</h2>
            <div className="stack-sm">
              <div className="spread">
                <span className="small subtle">Signed in as</span>
                <span className="small">{user?.email}</span>
              </div>
              <div className="spread">
                <span className="small subtle">Role</span>
                <Badge tone={user?.role === 'volunteer' ? 'neutral' : 'accent'}>{user?.role}</Badge>
              </div>
              <div className="spread">
                <span className="small subtle">Member since</span>
                <span className="small">{user ? formatDate(user.created_at, prefs) : '—'}</span>
              </div>
              <div className="spread">
                <span className="small subtle">Account status</span>
                <Badge tone={user?.status === 'active' ? 'success' : 'danger'}>{user?.status}</Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
