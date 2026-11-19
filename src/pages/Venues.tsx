import { useState, type FormEvent } from 'react';
import { api, ApiError, queryString, useDebounced, useFetch } from '../api';
import { canManage, useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDateTime } from '../format';
import type { Venue } from '../types';
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

const VENUE_STATUSES = ['active', 'maintenance', 'inactive'] as const;

type FormState = {
  name: string;
  address: string;
  city: string;
  capacity: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  address: '',
  city: '',
  capacity: '100',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  status: 'active',
  notes: '',
};

export default function Venues() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debounced = useDebounced(search);

  const venues = useFetch<{ venues: Venue[] }>(
    `/api/venues${queryString({ q: debounced, status })}`,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Venue | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const manage = canManage(user);
  const canDelete = user?.role === 'admin' || user?.role === 'organizer';

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(venue: Venue) {
    setEditing(venue);
    setForm({
      name: venue.name,
      address: venue.address ?? '',
      city: venue.city ?? '',
      capacity: String(venue.capacity),
      contact_name: venue.contact_name ?? '',
      contact_email: venue.contact_email ?? '',
      contact_phone: venue.contact_phone ?? '',
      status: venue.status,
      notes: venue.notes ?? '',
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const capacity = Number(form.capacity);
    if (!Number.isFinite(capacity) || capacity < 1) {
      setFormError('Capacity must be a whole number of at least 1.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      capacity,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) {
        await api(`/api/venues/${editing.id}`, { method: 'PATCH', body: payload });
        push('Venue updated');
      } else {
        await api('/api/venues', { method: 'POST', body: payload });
        push('Venue added');
      }
      setFormOpen(false);
      venues.reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Unable to save the venue');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/venues/${deleting.id}`, { method: 'DELETE' });
      push('Venue deleted');
      setDeleting(null);
      venues.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to delete the venue', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = venues.data?.venues ?? [];

  return (
    <>
      <PageHeader
        title="Venues"
        subtitle="Your venue register with capacity, contacts and utilisation."
        actions={
          manage ? (
            <Button variant="primary" icon="plus" onClick={openCreate}>
              Add venue
            </Button>
          ) : null
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search venues, cities, contacts…" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {VENUE_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Button icon="refresh" onClick={venues.reload}>
          Refresh
        </Button>
      </div>

      {venues.error ? <ErrorNote message={venues.error} onRetry={venues.reload} /> : null}

      {venues.loading && rows.length === 0 ? (
        <LoadingBlock label="Loading venues…" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="building"
            title="No venues yet"
            description={
              search || status
                ? 'No venues match these filters.'
                : 'Add your first venue so events can be scheduled against a real space.'
            }
            action={
              manage ? (
                <Button variant="primary" icon="plus" onClick={openCreate}>
                  Add venue
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="grid grid-3">
          {rows.map((venue) => (
            <Card key={venue.id} className="card-pad">
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <div className="stack-sm" style={{ minWidth: 0 }}>
                  <div className="row-tight">
                    <Icon name="building" size={15} />
                    <span style={{ fontWeight: 600 }}>{venue.name}</span>
                  </div>
                  <span className="small subtle row-tight">
                    <Icon name="pin" size={13} />
                    {venue.address ? `${venue.address}, ` : ''}
                    {venue.city ?? 'No city'}
                  </span>
                </div>
                <StatusBadge status={venue.status} />
              </div>

              <div className="row" style={{ margin: '14px 0 10px', gap: 8 }}>
                <Badge tone="accent">Capacity {venue.capacity}</Badge>
                <Badge tone="neutral">{venue.event_count ?? 0} events</Badge>
                {venue.upcoming_events ? (
                  <Badge tone="info">{venue.upcoming_events} upcoming</Badge>
                ) : null}
              </div>

              <div className="stack-sm small subtle">
                {venue.contact_name ? (
                  <span className="row-tight">
                    <Icon name="users" size={13} />
                    {venue.contact_name}
                  </span>
                ) : null}
                {venue.contact_email ? (
                  <a className="row-tight" href={`mailto:${venue.contact_email}`}>
                    <Icon name="mail" size={13} />
                    {venue.contact_email}
                  </a>
                ) : null}
                {venue.notes ? <p className="small muted truncate" title={venue.notes}>{venue.notes}</p> : null}
              </div>

              <div className="divider" style={{ margin: '12px 0' }} />

              <div className="spread">
                <span className="tiny subtle">
                  Added {formatDateTime(venue.created_at, prefs, { withTime: false })}
                </span>
                <div className="cell-actions">
                  {manage ? (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => openEdit(venue)}
                      aria-label={`Edit ${venue.name}`}
                    >
                      <Icon name="edit" size={15} />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => setDeleting(venue)}
                      aria-label={`Delete ${venue.name}`}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? `Edit ${editing.name}` : 'Add venue'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add venue'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />
          <div className="form-grid">
            <Field label="Venue name" htmlFor="venue-name" required className="span-2">
              <TextInput
                id="venue-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Riverside Hall"
                required
                minLength={2}
              />
            </Field>
            <Field label="Address" htmlFor="venue-address">
              <TextInput
                id="venue-address"
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                placeholder="12 Riverside Way"
              />
            </Field>
            <Field label="City" htmlFor="venue-city">
              <TextInput
                id="venue-city"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                placeholder="Manchester"
              />
            </Field>
            <Field
              label="Capacity"
              htmlFor="venue-capacity"
              required
              hint="Events cannot exceed this number of attendees."
            >
              <TextInput
                id="venue-capacity"
                type="number"
                min={1}
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                required
              />
            </Field>
            <Field label="Status" htmlFor="venue-status">
              <Select
                id="venue-status"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {VENUE_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contact name" htmlFor="venue-contact">
              <TextInput
                id="venue-contact"
                value={form.contact_name}
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                placeholder="Site manager"
              />
            </Field>
            <Field label="Contact email" htmlFor="venue-email">
              <TextInput
                id="venue-email"
                type="email"
                value={form.contact_email}
                onChange={(event) => setForm({ ...form, contact_email: event.target.value })}
                placeholder="manager@venue.com"
              />
            </Field>
            <Field label="Contact phone" htmlFor="venue-phone">
              <TextInput
                id="venue-phone"
                value={form.contact_phone}
                onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                placeholder="+44 7700 900000"
              />
            </Field>
            <Field label="Notes" htmlFor="venue-notes" className="span-2">
              <TextArea
                id="venue-notes"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Access instructions, loading bay, power, house rules."
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? 'venue'}?`}
        message="Venues can only be deleted when no events reference them. This cannot be undone."
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
