import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, queryString, useDebounced, useFetch } from '../api';
import { canManage, useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDateTime, fromInputValue, toInputValue } from '../format';
import type { EventRecord, Venue } from '../types';
import {
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

const STATUSES = ['draft', 'published', 'live', 'completed', 'cancelled'] as const;
const CATEGORIES = ['Conference', 'Festival', 'Exhibition', 'Concert', 'Sports', 'Community', 'Corporate'];

type FormState = {
  name: string;
  description: string;
  venue_id: string;
  category: string;
  starts_at: string;
  ends_at: string;
  status: string;
  expected_attendees: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  venue_id: '',
  category: 'Conference',
  starts_at: '',
  ends_at: '',
  status: 'draft',
  expected_attendees: '0',
};

export default function Events() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [venueFilter, setVenueFilter] = useState('');
  const debounced = useDebounced(search);

  const events = useFetch<{ events: EventRecord[] }>(
    `/api/events${queryString({ q: debounced, status, venue_id: venueFilter })}`,
  );
  const venues = useFetch<{ venues: Venue[] }>('/api/venues');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<EventRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const manage = canManage(user);
  const canDelete = user?.role === 'admin' || user?.role === 'organizer';
  const venueOptions = venues.data?.venues ?? [];

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, starts_at: '', ends_at: '' });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(event: EventRecord) {
    setEditing(event);
    setForm({
      name: event.name,
      description: event.description ?? '',
      venue_id: event.venue_id ? String(event.venue_id) : '',
      category: event.category ?? 'Conference',
      starts_at: toInputValue(event.starts_at),
      ends_at: toInputValue(event.ends_at),
      status: event.status,
      expected_attendees: String(event.expected_attendees),
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setFormError(null);

    const selectedVenue = venueOptions.find((venue) => String(venue.id) === form.venue_id);
    const attendees = Number(form.expected_attendees || 0);
    if (selectedVenue && attendees > selectedVenue.capacity) {
      setFormError(
        `Expected attendees (${attendees}) exceed ${selectedVenue.name}'s capacity of ${selectedVenue.capacity}.`,
      );
      return;
    }
    if (form.starts_at && form.ends_at && form.ends_at <= form.starts_at) {
      setFormError('The end time must be after the start time.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      venue_id: form.venue_id ? Number(form.venue_id) : null,
      category: form.category || null,
      starts_at: fromInputValue(form.starts_at),
      ends_at: fromInputValue(form.ends_at),
      status: form.status,
      expected_attendees: attendees,
    };

    setSaving(true);
    try {
      if (editing) {
        await api(`/api/events/${editing.id}`, { method: 'PATCH', body: payload });
        push('Event updated');
      } else {
        await api('/api/events', { method: 'POST', body: payload });
        push('Event created');
      }
      setFormOpen(false);
      events.reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Unable to save the event');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/events/${deleting.id}`, { method: 'DELETE' });
      push('Event deleted');
      setDeleting(null);
      events.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to delete the event', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = events.data?.events ?? [];

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Plan, publish and staff every event on the calendar."
        actions={
          manage ? (
            <Button variant="primary" icon="plus" onClick={openCreate}>
              New event
            </Button>
          ) : null
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search events…" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Select
          value={venueFilter}
          onChange={(event) => setVenueFilter(event.target.value)}
          aria-label="Filter by venue"
        >
          <option value="">All venues</option>
          {venueOptions.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </Select>
        <Button icon="refresh" onClick={events.reload} aria-label="Refresh events">
          Refresh
        </Button>
      </div>

      {events.error ? <ErrorNote message={events.error} onRetry={events.reload} /> : null}

      <Card>
        {events.loading && rows.length === 0 ? (
          <LoadingBlock label="Loading events…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No events found"
            description={
              search || status || venueFilter
                ? 'Try clearing your filters to see more events.'
                : 'Create your first event to start scheduling volunteers.'
            }
            action={
              manage ? (
                <Button variant="primary" icon="plus" onClick={openCreate}>
                  New event
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Venue</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Staffing</th>
                  <th>Attendees</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((event) => {
                  const fill = event.slots_total
                    ? Math.round(((event.slots_filled ?? 0) / event.slots_total) * 100)
                    : 0;
                  return (
                    <tr key={event.id}>
                      <td>
                        <div className="row-title">
                          <span className="cell-strong">{event.name}</span>
                          <span className="row-sub">
                            {event.category ?? 'Uncategorised'}
                            {event.organiser_name ? ` · ${event.organiser_name}` : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="row-title">
                          <span>{event.venue_name ?? 'Unassigned'}</span>
                          <span className="row-sub">{event.venue_city ?? '—'}</span>
                        </div>
                      </td>
                      <td className="cell-muted">
                        {formatDateTime(event.starts_at, prefs)}
                        <div className="row-sub">to {formatDateTime(event.ends_at, prefs)}</div>
                      </td>
                      <td>
                        <StatusBadge status={event.status} />
                      </td>
                      <td>
                        <div className="stack-sm">
                          <Progress
                            value={fill}
                            label={`${event.slots_filled}/${event.slots_total}`}
                          />
                          <span className="tiny subtle">
                            {event.shift_count ?? 0} shift{(event.shift_count ?? 0) === 1 ? '' : 's'}
                          </span>
                        </div>
                      </td>
                      <td className="numeric">{event.expected_attendees}</td>
                      <td>
                        <div className="cell-actions">
                          <Link
                            className="icon-btn"
                            to={`/shifts?event=${event.id}`}
                            title="View shifts"
                            aria-label={`View shifts for ${event.name}`}
                          >
                            <Icon name="clock" size={15} />
                          </Link>
                          {manage ? (
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => openEdit(event)}
                              title="Edit event"
                              aria-label={`Edit ${event.name}`}
                            >
                              <Icon name="edit" size={15} />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              className="icon-btn danger"
                              onClick={() => setDeleting(event)}
                              title="Delete event"
                              aria-label={`Delete ${event.name}`}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={formOpen}
        title={editing ? `Edit ${editing.name}` : 'New event'}
        description="Times are entered in UTC and shown in your preferred timezone."
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />
          <div className="form-grid">
            <Field label="Event name" htmlFor="event-name" required className="span-2">
              <TextInput
                id="event-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Northern Sound Festival"
                required
                minLength={2}
              />
            </Field>
            <Field label="Venue" htmlFor="event-venue">
              <Select
                id="event-venue"
                value={form.venue_id}
                onChange={(event) => setForm({ ...form, venue_id: event.target.value })}
              >
                <option value="">No venue yet</option>
                {venueOptions.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name} (cap. {venue.capacity})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="event-category">
              <Select
                id="event-category"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Starts at (UTC)" htmlFor="event-start" required>
              <TextInput
                id="event-start"
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) => setForm({ ...form, starts_at: event.target.value })}
                required
              />
            </Field>
            <Field label="Ends at (UTC)" htmlFor="event-end" required>
              <TextInput
                id="event-end"
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => setForm({ ...form, ends_at: event.target.value })}
                required
              />
            </Field>
            <Field label="Status" htmlFor="event-status">
              <Select
                id="event-status"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Expected attendees"
              htmlFor="event-attendees"
              hint={
                form.venue_id
                  ? `Venue capacity: ${
                      venueOptions.find((venue) => String(venue.id) === form.venue_id)?.capacity ?? '—'
                    }`
                  : undefined
              }
            >
              <TextInput
                id="event-attendees"
                type="number"
                min={0}
                value={form.expected_attendees}
                onChange={(event) => setForm({ ...form, expected_attendees: event.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor="event-description" className="span-2">
              <TextArea
                id="event-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What is happening, who it is for, and anything the crew must know."
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? 'event'}?`}
        message="Deleting an event also removes its shifts, assignments, tasks and incidents. This cannot be undone."
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
