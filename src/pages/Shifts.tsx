import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, queryString, useDebounced, useFetch } from '../api';
import { canManage, useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDateTime, fromInputValue, toInputValue } from '../format';
import type { Assignment, Conflict, EventRecord, Shift, Volunteer } from '../types';
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
  Progress,
  SearchInput,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  useToast,
} from '../ui';

const ASSIGNMENT_STATUSES = ['assigned', 'confirmed', 'declined', 'completed'] as const;
const SHIFT_ROLES = ['general', 'setup', 'steward', 'security', 'first aid', 'ticketing', 'stage crew', 'hospitality'];

type FormState = {
  event_id: string;
  title: string;
  role: string;
  starts_at: string;
  ends_at: string;
  capacity: string;
  location: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  event_id: '',
  title: '',
  role: 'general',
  starts_at: '',
  ends_at: '',
  capacity: '4',
  location: '',
  notes: '',
};

export default function Shifts() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { push } = useToast();
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState(params.get('event') ?? '');
  const [unfilledOnly, setUnfilledOnly] = useState(false);
  const debounced = useDebounced(search);

  const shifts = useFetch<{ shifts: Shift[] }>(
    `/api/shifts${queryString({
      q: debounced,
      event_id: eventFilter,
      unfilled: unfilledOnly ? 1 : '',
    })}`,
  );
  const events = useFetch<{ events: EventRecord[] }>('/api/events');
  const volunteers = useFetch<{ volunteers: Volunteer[] }>('/api/volunteers?status=active');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Shift | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [assigning, setAssigning] = useState<Shift | null>(null);
  const [assignVolunteerId, setAssignVolunteerId] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);

  const manage = canManage(user);
  const eventOptions = events.data?.events ?? [];
  const volunteerOptions = volunteers.data?.volunteers ?? [];

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, event_id: eventFilter });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(shift: Shift) {
    setEditing(shift);
    setForm({
      event_id: String(shift.event_id),
      title: shift.title,
      role: shift.role,
      starts_at: toInputValue(shift.starts_at),
      ends_at: toInputValue(shift.ends_at),
      capacity: String(shift.capacity),
      location: shift.location ?? '',
      notes: shift.notes ?? '',
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (form.starts_at && form.ends_at && form.ends_at <= form.starts_at) {
      setFormError('The shift must end after it starts.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        event_id: Number(form.event_id),
        title: form.title.trim(),
        role: form.role,
        starts_at: fromInputValue(form.starts_at),
        ends_at: fromInputValue(form.ends_at),
        capacity: Number(form.capacity),
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api(`/api/shifts/${editing.id}`, { method: 'PATCH', body: payload });
        push('Shift updated');
      } else {
        await api('/api/shifts', { method: 'POST', body: payload });
        push('Shift created');
      }
      setFormOpen(false);
      shifts.reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Unable to save this shift');
    } finally {
      setSaving(false);
    }
  }

  function openAssign(shift: Shift) {
    setAssigning(shift);
    setAssignVolunteerId('');
    setAssignError(null);
    setConflicts([]);
  }

  async function assign(force = false) {
    if (!assigning || !assignVolunteerId) {
      setAssignError('Choose a volunteer first.');
      return;
    }
    setAssignBusy(true);
    setAssignError(null);
    try {
      await api(`/api/shifts/${assigning.id}/assignments`, {
        method: 'POST',
        body: { user_id: Number(assignVolunteerId), force },
      });
      push('Volunteer assigned');
      setAssigning(null);
      shifts.reload();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const details = caught.details as { conflicts?: Conflict[] } | undefined;
        setConflicts(details?.conflicts ?? []);
        setAssignError(caught.message);
      } else {
        setAssignError('Unable to assign this volunteer');
      }
    } finally {
      setAssignBusy(false);
    }
  }

  async function setAssignmentStatus(shift: Shift, assignment: Assignment, status: string) {
    try {
      await api(`/api/shifts/${shift.id}/assignments/${assignment.user_id}`, {
        method: 'PATCH',
        body: { status },
      });
      shifts.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to update the assignment', 'error');
    }
  }

  async function removeAssignment(shift: Shift, assignment: Assignment) {
    try {
      await api(`/api/shifts/${shift.id}/assignments/${assignment.user_id}`, { method: 'DELETE' });
      push('Volunteer removed from shift');
      shifts.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to remove the assignment', 'error');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/shifts/${deleting.id}`, { method: 'DELETE' });
      push('Shift deleted');
      setDeleting(null);
      shifts.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to delete this shift', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = shifts.data?.shifts ?? [];

  return (
    <>
      <PageHeader
        title="Shift scheduling"
        subtitle="Build the roster, assign volunteers and catch double bookings before they happen."
        actions={
          manage ? (
            <Button variant="primary" icon="plus" onClick={openCreate} disabled={eventOptions.length === 0}>
              New shift
            </Button>
          ) : null
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search shifts, events, locations…" />
        <Select
          value={eventFilter}
          onChange={(event) => setEventFilter(event.target.value)}
          aria-label="Filter by event"
        >
          <option value="">All events</option>
          {eventOptions.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </Select>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={unfilledOnly}
            onChange={(event) => setUnfilledOnly(event.target.checked)}
          />
          <span className="small">Understaffed only</span>
        </label>
        <Button icon="refresh" onClick={shifts.reload}>
          Refresh
        </Button>
      </div>

      {shifts.error ? <ErrorNote message={shifts.error} onRetry={shifts.reload} /> : null}

      {shifts.loading && rows.length === 0 ? (
        <LoadingBlock label="Loading shifts…" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="clock"
            title="No shifts scheduled"
            description={
              eventOptions.length === 0
                ? 'Create an event first, then add shifts to it.'
                : 'Add a shift to start building the volunteer roster.'
            }
            action={
              manage && eventOptions.length > 0 ? (
                <Button variant="primary" icon="plus" onClick={openCreate}>
                  New shift
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="stack">
          {rows.map((shift) => {
            const fill = shift.capacity ? (shift.assigned_count / shift.capacity) * 100 : 0;
            const open = Math.max(0, shift.capacity - shift.assigned_count);
            return (
              <Card key={shift.id} className="card-pad">
                <div className="spread" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div className="stack-sm" style={{ minWidth: 0 }}>
                    <div className="row-tight" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 620 }}>{shift.title}</span>
                      <Badge tone="accent">{shift.role}</Badge>
                      <StatusBadge status={shift.event_status} />
                    </div>
                    <span className="small subtle">
                      {shift.event_name}
                      {shift.venue_name ? ` · ${shift.venue_name}` : ''}
                    </span>
                    <span className="small subtle row-tight">
                      <Icon name="clock" size={13} />
                      {formatDateTime(shift.starts_at, prefs)} → {formatDateTime(shift.ends_at, prefs)}
                      {shift.location ? ` · ${shift.location}` : ''}
                    </span>
                  </div>
                  <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                    <span className="tiny subtle">
                      {shift.assigned_count}/{shift.capacity} filled
                      {open > 0 ? ` · ${open} open` : ''}
                    </span>
                    <Progress value={fill} label={`${Math.round(fill)}%`} />
                    <div className="row-tight" style={{ gap: 8 }}>
                      {manage ? (
                        <Button size="sm" icon="user-plus" onClick={() => openAssign(shift)} disabled={open === 0}>
                          Assign
                        </Button>
                      ) : null}
                      {manage ? (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => openEdit(shift)}
                          aria-label={`Edit ${shift.title}`}
                        >
                          <Icon name="edit" size={15} />
                        </button>
                      ) : null}
                      {manage ? (
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => setDeleting(shift)}
                          aria-label={`Delete ${shift.title}`}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="divider" style={{ margin: '12px 0' }} />

                {shift.assignments.length === 0 ? (
                  <p className="small subtle">No volunteers assigned yet.</p>
                ) : (
                  <div className="crew-list">
                    {shift.assignments.map((assignment) => {
                      const isSelf = assignment.user_id === user?.id;
                      return (
                        <div className="crew-chip" key={assignment.id}>
                          <span className="crew-name">{assignment.name ?? 'Volunteer'}</span>
                          {manage ? (
                            <Select
                              value={assignment.status}
                              aria-label={`Status for ${assignment.name}`}
                              onChange={(event) => setAssignmentStatus(shift, assignment, event.target.value)}
                            >
                              {ASSIGNMENT_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <StatusBadge status={assignment.status} />
                          )}
                          {isSelf && !manage ? (
                            <button
                              type="button"
                              className="link-button tiny"
                              onClick={() =>
                                setAssignmentStatus(
                                  shift,
                                  assignment,
                                  assignment.status === 'confirmed' ? 'declined' : 'confirmed',
                                )
                              }
                            >
                              {assignment.status === 'confirmed' ? 'Decline' : 'Confirm'}
                            </button>
                          ) : null}
                          {manage ? (
                            <button
                              type="button"
                              className="icon-btn danger"
                              onClick={() => removeAssignment(shift, assignment)}
                              aria-label={`Remove ${assignment.name} from ${shift.title}`}
                            >
                              <Icon name="x" size={13} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? `Edit ${editing.title}` : 'New shift'}
        description="Times are entered in UTC and displayed in your preferred timezone."
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create shift'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />
          <div className="form-grid">
            <Field label="Event" htmlFor="shift-event" required>
              <Select
                id="shift-event"
                value={form.event_id}
                onChange={(event) => setForm({ ...form, event_id: event.target.value })}
                required
              >
                <option value="">Choose an event</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Shift title" htmlFor="shift-title" required>
              <TextInput
                id="shift-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Gates & welcome desk"
                required
              />
            </Field>
            <Field label="Role" htmlFor="shift-role">
              <Select
                id="shift-role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                {SHIFT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Volunteers needed" htmlFor="shift-capacity" required>
              <TextInput
                id="shift-capacity"
                type="number"
                min={1}
                max={500}
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                required
              />
            </Field>
            <Field label="Starts (UTC)" htmlFor="shift-start" required>
              <TextInput
                id="shift-start"
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) => setForm({ ...form, starts_at: event.target.value })}
                required
              />
            </Field>
            <Field label="Ends (UTC)" htmlFor="shift-end" required>
              <TextInput
                id="shift-end"
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => setForm({ ...form, ends_at: event.target.value })}
                required
              />
            </Field>
            <Field label="Meeting point" htmlFor="shift-location" className="span-2">
              <TextInput
                id="shift-location"
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder="Staff entrance, north gate"
              />
            </Field>
            <Field label="Briefing notes" htmlFor="shift-notes" className="span-2">
              <TextArea
                id="shift-notes"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="What this crew does, who reports to whom, equipment needed."
              />
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(assigning)}
        title={assigning ? `Assign volunteer to ${assigning.title}` : 'Assign volunteer'}
        description={
          assigning
            ? `${formatDateTime(assigning.starts_at, prefs)} → ${formatDateTime(assigning.ends_at, prefs)}`
            : undefined
        }
        onClose={() => setAssigning(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssigning(null)} disabled={assignBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => assign(false)}
              disabled={assignBusy || conflicts.length > 0}
            >
              {assignBusy ? 'Assigning…' : 'Assign'}
            </Button>
          </>
        }
      >
        <FormError message={assignError} />
        <Field label="Volunteer" htmlFor="assign-volunteer" required>
          <Select
            id="assign-volunteer"
            value={assignVolunteerId}
            onChange={(event) => setAssignVolunteerId(event.target.value)}
          >
            <option value="">Choose a volunteer</option>
            {volunteerOptions.map((volunteer) => (
              <option key={volunteer.id} value={volunteer.id}>
                {volunteer.name} · {volunteer.role}
              </option>
            ))}
          </Select>
        </Field>
        {conflicts.length > 0 ? (
          <div className="conflict-box" style={{ marginTop: 14 }}>
            <div className="row-tight" style={{ marginBottom: 8 }}>
              <Icon name="alert" size={15} />
              <span className="small" style={{ fontWeight: 600 }}>
                Overlapping shifts detected
              </span>
            </div>
            <div className="stack-sm">
              {conflicts.map((conflict) => (
                <div className="small" key={conflict.shift_id}>
                  {conflict.title} · {conflict.event_name} · {formatDateTime(conflict.starts_at, prefs)} →{' '}
                  {formatDateTime(conflict.ends_at, prefs)}
                </div>
              ))}
            </div>
            <Button
              variant="danger"
              size="sm"
              style={{ marginTop: 12 }}
              onClick={() => assign(true)}
              disabled={assignBusy}
            >
              Assign anyway (override conflict)
            </Button>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.title ?? 'shift'}?`}
        message="The shift, its assignments and any attendance recorded for it are removed. This cannot be undone."
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
