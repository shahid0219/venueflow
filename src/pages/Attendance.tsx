import { useState, type FormEvent } from 'react';
import { api, ApiError, queryString, useFetch } from '../api';
import { canManage, useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDateTime, fromInputValue, toInputValue } from '../format';
import type { AttendanceRecord, EventRecord, Shift, Volunteer } from '../types';
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
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  useToast,
} from '../ui';

const STATUSES = ['present', 'late', 'absent'] as const;

type FormState = {
  shift_id: string;
  user_id: string;
  status: 'present' | 'late' | 'absent';
  checked_in_at: string;
  checked_out_at: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  shift_id: '',
  user_id: '',
  status: 'present',
  checked_in_at: '',
  checked_out_at: '',
  notes: '',
};

function dayStart(value: string): string {
  return value ? `${value}T00:00:00.000Z` : '';
}

function dayEnd(value: string): string {
  return value ? `${value}T23:59:59.999Z` : '';
}

export default function Attendance() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { push } = useToast();
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const list = useFetch<{ attendance: AttendanceRecord[] }>(
    `/api/attendance${queryString({
      event_id: eventFilter,
      status: statusFilter,
      from: dayStart(from),
      to: dayEnd(to),
    })}`,
  );
  const shifts = useFetch<{ shifts: Shift[] }>('/api/shifts');
  const events = useFetch<{ events: EventRecord[] }>('/api/events');
  const volunteers = useFetch<{ volunteers: Volunteer[] }>('/api/volunteers?status=active');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AttendanceRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const manage = canManage(user);
  const shiftOptions = shifts.data?.shifts ?? [];
  const eventOptions = events.data?.events ?? [];
  const volunteerOptions = volunteers.data?.volunteers ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(record: AttendanceRecord) {
    setEditing(record);
    setForm({
      shift_id: String(record.shift_id),
      user_id: String(record.user_id),
      status: record.status,
      checked_in_at: toInputValue(record.checked_in_at),
      checked_out_at: toInputValue(record.checked_out_at),
      notes: record.notes ?? '',
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (form.checked_in_at && form.checked_out_at && form.checked_out_at <= form.checked_in_at) {
      setFormError('Check-out must be after check-in.');
      return;
    }
    setSaving(true);
    try {
      const times = {
        status: form.status,
        checked_in_at: form.checked_in_at ? fromInputValue(form.checked_in_at) : null,
        checked_out_at: form.checked_out_at ? fromInputValue(form.checked_out_at) : null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api(`/api/attendance/${editing.id}`, { method: 'PATCH', body: times });
        push('Attendance updated');
      } else {
        if (!form.shift_id || !form.user_id) {
          setFormError('Choose a shift and a volunteer.');
          setSaving(false);
          return;
        }
        await api('/api/attendance', {
          method: 'POST',
          body: { ...times, shift_id: Number(form.shift_id), user_id: Number(form.user_id) },
        });
        push('Attendance recorded');
      }
      setFormOpen(false);
      list.reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Unable to save this record');
    } finally {
      setSaving(false);
    }
  }

  async function quickAction(record: AttendanceRecord, action: 'check-in' | 'check-out') {
    setBusyId(record.id);
    try {
      await api(`/api/attendance/${action}`, {
        method: 'POST',
        body: { shift_id: record.shift_id, user_id: record.user_id },
      });
      push(action === 'check-in' ? 'Checked in' : 'Checked out');
      list.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to update attendance', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/attendance/${deleting.id}`, { method: 'DELETE' });
      push('Attendance record deleted');
      setDeleting(null);
      list.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to delete this record', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = list.data?.attendance ?? [];
  const totals = rows.reduce(
    (acc, row) => ({
      present: acc.present + (row.status === 'present' ? 1 : 0),
      late: acc.late + (row.status === 'late' ? 1 : 0),
      absent: acc.absent + (row.status === 'absent' ? 1 : 0),
      hours: Math.round((acc.hours + Number(row.hours ?? 0)) * 100) / 100,
    }),
    { present: 0, late: 0, absent: 0, hours: 0 },
  );

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Check volunteers in and out, log absences and keep hours accurate."
        actions={
          manage ? (
            <Button variant="primary" icon="check" onClick={openCreate}>
              Record attendance
            </Button>
          ) : null
        }
      />

      <div className="toolbar">
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
        <Select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
        <TextInput
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="From date"
        />
        <TextInput
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-label="To date"
        />
        <Button icon="refresh" onClick={list.reload}>
          Refresh
        </Button>
      </div>

      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Badge tone="success">{totals.present} present</Badge>
        <Badge tone="warning">{totals.late} late</Badge>
        <Badge tone="danger">{totals.absent} absent</Badge>
        <Badge tone="info">{totals.hours} hours logged</Badge>
      </div>

      <Card>
        {list.loading && rows.length === 0 ? (
          <LoadingBlock label="Loading attendance…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="check"
            title="No attendance yet"
            description="Check volunteers in from a shift, or record attendance manually."
            action={
              manage ? (
                <Button variant="primary" icon="check" onClick={openCreate}>
                  Record attendance
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
                  <th>Shift</th>
                  <th>Status</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Hours</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <span className="cell-strong">{record.user_name}</span>
                      <span className="row-sub">{record.user_email ?? ''}</span>
                    </td>
                    <td>
                      <span className="small">{record.shift_title}</span>
                      <span className="row-sub">{record.event_name}</span>
                    </td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="cell-muted">
                      {record.checked_in_at ? formatDateTime(record.checked_in_at, prefs) : '—'}
                    </td>
                    <td className="cell-muted">
                      {record.checked_out_at ? formatDateTime(record.checked_out_at, prefs) : '—'}
                    </td>
                    <td className="cell-muted">{record.hours ?? 0}</td>
                    <td>
                      <div className="cell-actions">
                        {manage && !record.checked_in_at ? (
                          <Button
                            size="sm"
                            onClick={() => quickAction(record, 'check-in')}
                            disabled={busyId === record.id}
                          >
                            Check in
                          </Button>
                        ) : null}
                        {manage && record.checked_in_at && !record.checked_out_at ? (
                          <Button
                            size="sm"
                            onClick={() => quickAction(record, 'check-out')}
                            disabled={busyId === record.id}
                          >
                            Check out
                          </Button>
                        ) : null}
                        {manage ? (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => openEdit(record)}
                            aria-label={`Edit attendance for ${record.user_name}`}
                            title="Edit"
                          >
                            <Icon name="edit" size={15} />
                          </button>
                        ) : null}
                        {manage ? (
                          <button
                            type="button"
                            className="icon-btn danger"
                            onClick={() => setDeleting(record)}
                            aria-label={`Delete attendance for ${record.user_name}`}
                            title="Delete"
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
        title={editing ? 'Edit attendance' : 'Record attendance'}
        description="Times are stored in UTC and shown in your preferred timezone."
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save record'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />
          <div className="form-grid">
            <Field label="Shift" htmlFor="att-shift" required>
              <Select
                id="att-shift"
                value={form.shift_id}
                onChange={(event) => setForm({ ...form, shift_id: event.target.value })}
                disabled={Boolean(editing)}
                required
              >
                <option value="">Choose a shift</option>
                {shiftOptions.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.title} · {shift.event_name} · {formatDateTime(shift.starts_at, prefs)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Volunteer" htmlFor="att-user" required>
              <Select
                id="att-user"
                value={form.user_id}
                onChange={(event) => setForm({ ...form, user_id: event.target.value })}
                disabled={Boolean(editing)}
                required
              >
                <option value="">Choose a volunteer</option>
                {volunteerOptions.map((volunteer) => (
                  <option key={volunteer.id} value={volunteer.id}>
                    {volunteer.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="att-status">
              <Select
                id="att-status"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as FormState['status'] })
                }
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </Field>
            <div />
            <Field label="Checked in (UTC)" htmlFor="att-in">
              <TextInput
                id="att-in"
                type="datetime-local"
                value={form.checked_in_at}
                onChange={(event) => setForm({ ...form, checked_in_at: event.target.value })}
              />
            </Field>
            <Field label="Checked out (UTC)" htmlFor="att-out">
              <TextInput
                id="att-out"
                type="datetime-local"
                value={form.checked_out_at}
                onChange={(event) => setForm({ ...form, checked_out_at: event.target.value })}
              />
            </Field>
            <Field label="Notes" htmlFor="att-notes" className="span-2">
              <TextArea
                id="att-notes"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Reason for lateness, early departure, handover notes."
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete attendance record?"
        message="The logged hours for this volunteer will be removed from reports. This cannot be undone."
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
