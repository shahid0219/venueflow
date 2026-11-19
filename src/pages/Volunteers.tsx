import { useState, type FormEvent } from 'react';
import { api, ApiError, queryString, useDebounced, useFetch } from '../api';
import { canManage, useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDate, formatDateTime, relativeTime } from '../format';
import type { Role, TaskRecord, Volunteer } from '../types';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Field,
  FormError,
  Icon,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  useToast,
} from '../ui';

const ROLES: Role[] = ['admin', 'organizer', 'coordinator', 'volunteer'];

type FormState = {
  name: string;
  email: string;
  password: string;
  role: Role;
  phone: string;
  city: string;
  skills: string;
  availability: string;
  bio: string;
  status: 'active' | 'inactive';
};

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  password: '',
  role: 'volunteer',
  phone: '',
  city: '',
  skills: '',
  availability: '',
  bio: '',
  status: 'active',
};

type VolunteerDetail = {
  volunteer: Volunteer;
  shifts: {
    assignment_id: number;
    assignment_status: string;
    shift_id: number;
    title: string;
    role: string;
    starts_at: string;
    ends_at: string;
    location: string | null;
    event_id: number;
    event_name: string;
    venue_name: string | null;
  }[];
  attendance: {
    id: number;
    status: string;
    checked_in_at: string | null;
    checked_out_at: string | null;
    hours: number;
    shift_title: string;
    shift_starts_at: string;
    event_name: string;
  }[];
  tasks: TaskRecord[];
};

export default function Volunteers() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const debounced = useDebounced(search);

  const list = useFetch<{ volunteers: Volunteer[] }>(
    `/api/volunteers${queryString({ q: debounced, role, status })}`,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Volunteer | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Volunteer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);

  const manage = canManage(user);
  const isAdmin = user?.role === 'admin';

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(volunteer: Volunteer) {
    setEditing(volunteer);
    setForm({
      name: volunteer.name,
      email: volunteer.email,
      password: '',
      role: volunteer.role,
      phone: volunteer.phone ?? '',
      city: volunteer.city ?? '',
      skills: volunteer.skills ?? '',
      availability: volunteer.availability ?? '',
      bio: volunteer.bio ?? '',
      status: volunteer.status,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      if (editing) {
        await api(`/api/volunteers/${editing.id}`, {
          method: 'PATCH',
          body: {
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            city: form.city.trim() || null,
            skills: form.skills.trim() || null,
            availability: form.availability.trim() || null,
            bio: form.bio.trim() || null,
            status: form.status,
          },
        });
        if (isAdmin && form.role !== editing.role) {
          await api(`/api/volunteers/${editing.id}/role`, {
            method: 'PATCH',
            body: { role: form.role },
          });
        }
        push('Volunteer updated');
      } else {
        await api('/api/volunteers', {
          method: 'POST',
          body: {
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            role: form.role,
            phone: form.phone.trim() || null,
            city: form.city.trim() || null,
            skills: form.skills.trim() || null,
            availability: form.availability.trim() || null,
            bio: form.bio.trim() || null,
          },
        });
        push('Volunteer added — share the temporary password with them');
      }
      setFormOpen(false);
      list.reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Unable to save this volunteer');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/volunteers/${deleting.id}`, { method: 'DELETE' });
      push('Volunteer removed');
      setDeleting(null);
      list.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to remove this volunteer', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = list.data?.volunteers ?? [];

  return (
    <>
      <PageHeader
        title="Volunteers"
        subtitle="Directory of everyone working your events, with workload and reliability."
        actions={
          manage ? (
            <Button variant="primary" icon="user-plus" onClick={openCreate}>
              Add member
            </Button>
          ) : null
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, city, skills…" />
        <Select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {ROLES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
        </Select>
        <Button icon="refresh" onClick={list.reload}>
          Refresh
        </Button>
      </div>

      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}

      <Card>
        {list.loading && rows.length === 0 ? (
          <LoadingBlock label="Loading volunteers…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="users"
            title="No volunteers found"
            description={
              search || role || status
                ? 'No directory entries match these filters.'
                : 'Add your first volunteer to start assigning shifts.'
            }
            action={
              manage ? (
                <Button variant="primary" icon="user-plus" onClick={openCreate}>
                  Add member
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Volunteer</th>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Skills</th>
                  <th>Workload</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((volunteer) => (
                  <tr key={volunteer.id}>
                    <td>
                      <button
                        type="button"
                        className="link-button row-title"
                        onClick={() => setProfileId(volunteer.id)}
                      >
                        <span className="cell-strong">{volunteer.name}</span>
                        <span className="row-sub">{volunteer.email}</span>
                      </button>
                    </td>
                    <td>
                      <Badge tone={volunteer.role === 'volunteer' ? 'neutral' : 'accent'}>
                        {volunteer.role}
                      </Badge>
                    </td>
                    <td className="cell-muted">{volunteer.city ?? '—'}</td>
                    <td className="cell-muted truncate" title={volunteer.skills ?? ''}>
                      {volunteer.skills ?? '—'}
                    </td>
                    <td>
                      <div className="row-tight" style={{ gap: 10 }}>
                        <span className="tiny subtle">{volunteer.assignment_count ?? 0} shifts</span>
                        <span className="tiny subtle">{volunteer.hours ?? 0} h</span>
                        {volunteer.open_tasks ? (
                          <span className="tiny subtle">{volunteer.open_tasks} tasks</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={volunteer.status} />
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setProfileId(volunteer.id)}
                          aria-label={`View profile for ${volunteer.name}`}
                          title="View profile"
                        >
                          <Icon name="eye" size={15} />
                        </button>
                        {manage ? (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openEdit(volunteer)}
                            aria-label={`Edit ${volunteer.name}`}
                            title="Edit"
                          >
                            <Icon name="edit" size={15} />
                          </button>
                        ) : null}
                        {isAdmin && volunteer.id !== user?.id ? (
                          <button
                            type="button"
                            className="icon-btn danger"
                            onClick={() => setDeleting(volunteer)}
                            aria-label={`Remove ${volunteer.name}`}
                            title="Remove"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={formOpen}
        title={editing ? `Edit ${editing.name}` : 'Add member'}
        description={
          editing
            ? 'Update contact details, skills and availability.'
            : 'Creates a real account. Share the temporary password so they can sign in and change it.'
        }
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />
          <div className="form-grid">
            <Field label="Full name" htmlFor="vol-name" required>
              <TextInput
                id="vol-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                minLength={2}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="vol-email"
              required={!editing}
              hint={editing ? 'Emails cannot be changed after sign-up.' : undefined}
            >
              <TextInput
                id="vol-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                disabled={Boolean(editing)}
                required={!editing}
              />
            </Field>
            {!editing ? (
              <Field
                label="Temporary password"
                htmlFor="vol-password"
                required
                hint="At least 8 characters. The member can change it in Settings."
              >
                <TextInput
                  id="vol-password"
                  type="text"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </Field>
            ) : null}
            <Field label="Role" htmlFor="vol-role" hint={isAdmin ? undefined : 'Only admins can change roles.'}>
              <Select
                id="vol-role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
                disabled={!isAdmin}
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone" htmlFor="vol-phone">
              <TextInput
                id="vol-phone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+44 7700 900000"
              />
            </Field>
            <Field label="City" htmlFor="vol-city">
              <TextInput
                id="vol-city"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </Field>
            {editing ? (
              <Field label="Account status" htmlFor="vol-status">
                <Select
                  id="vol-status"
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value as 'active' | 'inactive' })
                  }
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </Select>
              </Field>
            ) : null}
            <Field
              label="Skills"
              htmlFor="vol-skills"
              className="span-2"
              hint="Comma separated, e.g. first aid, stage crew, ticketing."
            >
              <TextInput
                id="vol-skills"
                value={form.skills}
                onChange={(event) => setForm({ ...form, skills: event.target.value })}
              />
            </Field>
            <Field label="Availability" htmlFor="vol-availability" className="span-2">
              <TextInput
                id="vol-availability"
                value={form.availability}
                onChange={(event) => setForm({ ...form, availability: event.target.value })}
                placeholder="Weekends and weekday evenings"
              />
            </Field>
            <Field label="Notes" htmlFor="vol-bio" className="span-2">
              <TextArea
                id="vol-bio"
                value={form.bio}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
                placeholder="Anything a coordinator should know."
              />
            </Field>
          </div>
        </form>
      </Modal>

      <VolunteerProfile
        id={profileId}
        prefs={prefs}
        onClose={() => setProfileId(null)}
        onEdit={(volunteer) => {
          setProfileId(null);
          openEdit(volunteer);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Remove ${deleting?.name ?? 'member'}?`}
        message="Their account, shift assignments, attendance records and task assignments are deleted. This cannot be undone."
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function VolunteerProfile({
  id,
  prefs,
  onClose,
  onEdit,
}: {
  id: number | null;
  prefs: ReturnType<typeof usePrefs>['prefs'];
  onClose: () => void;
  onEdit: (volunteer: Volunteer) => void;
}) {
  const detail = useFetch<VolunteerDetail>(id ? `/api/volunteers/${id}` : null);
  const volunteer = detail.data?.volunteer;

  return (
    <Modal
      open={Boolean(id)}
      title={volunteer?.name ?? 'Volunteer profile'}
      description={volunteer ? `${volunteer.email} · ${volunteer.role}` : undefined}
      onClose={onClose}
      wide
      footer={
        volunteer ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" icon="edit" onClick={() => onEdit(volunteer)}>
              Edit profile
            </Button>
          </>
        ) : null
      }
    >
      {detail.loading ? <LoadingBlock label="Loading profile…" /> : null}
      {detail.error ? <ErrorNote message={detail.error} onRetry={detail.reload} /> : null}
      {detail.data ? (
        <div className="stack">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={detail.data.volunteer.status} />
            <Badge tone="accent">{detail.data.volunteer.assignment_count ?? 0} assignments</Badge>
            <Badge tone="neutral">{detail.data.volunteer.hours ?? 0} hours</Badge>
            <Badge tone="info">{detail.data.volunteer.open_tasks ?? 0} open tasks</Badge>
            <span className="tiny subtle">
              Joined {formatDate(detail.data.volunteer.created_at, prefs)}
            </span>
          </div>

          <div className="grid grid-2" style={{ gap: 12 }}>
            <div className="stack-sm">
              <span className="tiny subtle">Contact</span>
              <span className="small">{detail.data.volunteer.phone ?? 'No phone'}</span>
              <span className="small">{detail.data.volunteer.city ?? 'No city'}</span>
            </div>
            <div className="stack-sm">
              <span className="tiny subtle">Availability</span>
              <span className="small">{detail.data.volunteer.availability ?? 'Not specified'}</span>
            </div>
          </div>

          {detail.data.volunteer.skills ? (
            <div className="stack-sm">
              <span className="tiny subtle">Skills</span>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {detail.data.volunteer.skills.split(',').map((skill) => (
                  <Badge key={skill} tone="violet">
                    {skill.trim()}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {detail.data.volunteer.bio ? (
            <div className="stack-sm">
              <span className="tiny subtle">Notes</span>
              <p className="small muted">{detail.data.volunteer.bio}</p>
            </div>
          ) : null}

          <div className="stack-sm">
            <span className="tiny subtle">Shift history</span>
            {detail.data.shifts.length === 0 ? (
              <p className="small subtle">No shifts assigned yet.</p>
            ) : (
              detail.data.shifts.slice(0, 8).map((shift) => (
                <div className="spread small" key={shift.assignment_id}>
                  <span className="truncate">
                    {shift.title} · {shift.event_name}
                  </span>
                  <span className="row-tight" style={{ gap: 8 }}>
                    <span className="subtle">{formatDateTime(shift.starts_at, prefs)}</span>
                    <StatusBadge status={shift.assignment_status} />
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="stack-sm">
            <span className="tiny subtle">Attendance</span>
            {detail.data.attendance.length === 0 ? (
              <p className="small subtle">No attendance recorded.</p>
            ) : (
              detail.data.attendance.slice(0, 8).map((record) => (
                <div className="spread small" key={record.id}>
                  <span className="truncate">
                    {record.shift_title} · {record.event_name}
                  </span>
                  <span className="row-tight" style={{ gap: 8 }}>
                    <span className="subtle">{relativeTime(record.shift_starts_at, prefs)}</span>
                    <StatusBadge status={record.status} />
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
