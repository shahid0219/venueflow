import { useState, type FormEvent } from 'react';
import { api, ApiError, queryString, useDebounced, useFetch } from '../api';
import { canManage, useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDateTime, fromInputValue, relativeTime, toInputValue } from '../format';
import type { EventRecord, Incident } from '../types';
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

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const STATUSES = ['open', 'investigating', 'resolved'] as const;

type FormState = {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved';
  event_id: string;
  occurred_at: string;
  resolution: string;
};

function nowLocal(): string {
  return toInputValue(new Date().toISOString());
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  severity: 'medium',
  status: 'open',
  event_id: '',
  occurred_at: '',
  resolution: '',
};

function severityTone(severity: string) {
  if (severity === 'critical') return 'danger' as const;
  if (severity === 'high') return 'warning' as const;
  if (severity === 'medium') return 'info' as const;
  return 'neutral' as const;
}

export default function Incidents() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debounced = useDebounced(search);

  const list = useFetch<{ incidents: Incident[] }>(
    `/api/incidents${queryString({
      q: debounced,
      severity: severityFilter,
      status: statusFilter,
    })}`,
  );
  const events = useFetch<{ events: EventRecord[] }>('/api/events');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Incident | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const manage = canManage(user);
  const eventOptions = events.data?.events ?? [];

  function openReport() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, occurred_at: nowLocal() });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(incident: Incident) {
    setEditing(incident);
    setForm({
      title: incident.title,
      description: incident.description ?? '',
      severity: incident.severity,
      status: incident.status,
      event_id: incident.event_id ? String(incident.event_id) : '',
      occurred_at: toInputValue(incident.occurred_at),
      resolution: incident.resolution ?? '',
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
        const payload: Record<string, unknown> = {
          status: form.status,
          resolution: form.resolution.trim() || null,
        };
        if (manage) {
          payload.title = form.title.trim();
          payload.description = form.description.trim() || null;
          payload.severity = form.severity;
          payload.event_id = form.event_id ? Number(form.event_id) : null;
          payload.occurred_at = form.occurred_at ? fromInputValue(form.occurred_at) : undefined;
        }
        await api(`/api/incidents/${editing.id}`, { method: 'PATCH', body: payload });
        push('Incident updated');
      } else {
        await api('/api/incidents', {
          method: 'POST',
          body: {
            title: form.title.trim(),
            description: form.description.trim() || null,
            severity: form.severity,
            event_id: form.event_id ? Number(form.event_id) : null,
            occurred_at: form.occurred_at ? fromInputValue(form.occurred_at) : null,
          },
        });
        push('Incident reported');
      }
      setFormOpen(false);
      list.reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Unable to save this incident');
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(incident: Incident, status: string) {
    if (status === 'resolved' && !incident.resolution) {
      openEdit(incident);
      push('Add a resolution note to close this incident', 'info');
      return;
    }
    try {
      await api(`/api/incidents/${incident.id}`, { method: 'PATCH', body: { status } });
      push(`Incident marked ${status}`);
      list.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to update this incident', 'error');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/incidents/${deleting.id}`, { method: 'DELETE' });
      push('Incident deleted');
      setDeleting(null);
      list.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to delete this incident', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = list.data?.incidents ?? [];
  const openCount = rows.filter((incident) => incident.status !== 'resolved').length;

  return (
    <>
      <PageHeader
        title="Incidents"
        subtitle="Log anything that went wrong on site and track it through to resolution."
        actions={
          <Button variant="primary" icon="alert" onClick={openReport}>
            Report incident
          </Button>
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search incidents…" />
        <Select
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value)}
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
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
        <Button icon="refresh" onClick={list.reload}>
          Refresh
        </Button>
      </div>

      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <Badge tone={openCount > 0 ? 'warning' : 'success'}>{openCount} unresolved</Badge>
        <Badge tone="neutral">{rows.length} in view</Badge>
      </div>

      {list.loading && rows.length === 0 ? (
        <LoadingBlock label="Loading incidents…" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="alert"
            title="No incidents reported"
            description={
              search || severityFilter || statusFilter
                ? 'No incidents match these filters.'
                : 'That is a good sign. Log anything that needs a paper trail here.'
            }
            action={
              <Button variant="primary" icon="alert" onClick={openReport}>
                Report incident
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="stack">
          {rows.map((incident) => {
            const isReporter = incident.reported_by === user?.id;
            return (
              <Card key={incident.id} className="card-pad">
                <div className="spread" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div className="stack-sm" style={{ minWidth: 0 }}>
                    <div className="row-tight" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 620 }}>{incident.title}</span>
                      <Badge tone={severityTone(incident.severity)}>{incident.severity}</Badge>
                      <StatusBadge status={incident.status} />
                    </div>
                    <span className="small subtle">
                      {incident.event_name ?? 'No event'} · reported by{' '}
                      {incident.reporter_name ?? 'unknown'} · {relativeTime(incident.occurred_at, prefs)}
                    </span>
                    {incident.description ? (
                      <p className="small muted" style={{ marginTop: 4 }}>
                        {incident.description}
                      </p>
                    ) : null}
                    {incident.resolution ? (
                      <div className="resolution-box">
                        <span className="tiny subtle">Resolution</span>
                        <p className="small" style={{ margin: 0 }}>
                          {incident.resolution}
                        </p>
                        {incident.resolved_at ? (
                          <span className="tiny subtle">
                            Closed {formatDateTime(incident.resolved_at, prefs)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                    {manage ? (
                      <Select
                        value={incident.status}
                        aria-label={`Status for ${incident.title}`}
                        onChange={(event) => quickStatus(incident, event.target.value)}
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <div className="row-tight" style={{ gap: 8 }}>
                      {manage || isReporter ? (
                        <Button size="sm" icon="edit" onClick={() => openEdit(incident)}>
                          {manage ? 'Update' : 'Resolve'}
                        </Button>
                      ) : null}
                      {manage ? (
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => setDeleting(incident)}
                          aria-label={`Delete ${incident.title}`}
                          title="Delete"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? `Update incident #${editing.id}` : 'Report an incident'}
        description={
          editing
            ? manage
              ? 'Change severity, status or add the resolution note.'
              : 'Add what was done to resolve this incident.'
            : 'Record what happened, when, and how serious it was.'
        }
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Report incident'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />
          <div className="form-grid">
            <Field label="Title" htmlFor="inc-title" required className="span-2">
              <TextInput
                id="inc-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Crowd surge at north gate"
                required
                disabled={Boolean(editing) && !manage}
              />
            </Field>
            <Field label="Severity" htmlFor="inc-severity">
              <Select
                id="inc-severity"
                value={form.severity}
                onChange={(event) =>
                  setForm({ ...form, severity: event.target.value as FormState['severity'] })
                }
                disabled={Boolean(editing) && !manage}
              >
                {SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="inc-status">
              <Select
                id="inc-status"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as FormState['status'] })
                }
                disabled={!manage && !editing}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Event" htmlFor="inc-event">
              <Select
                id="inc-event"
                value={form.event_id}
                onChange={(event) => setForm({ ...form, event_id: event.target.value })}
                disabled={Boolean(editing) && !manage}
              >
                <option value="">No event</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Occurred at (UTC)" htmlFor="inc-occurred">
              <TextInput
                id="inc-occurred"
                type="datetime-local"
                value={form.occurred_at}
                onChange={(event) => setForm({ ...form, occurred_at: event.target.value })}
                disabled={Boolean(editing) && !manage}
              />
            </Field>
            <Field label="What happened" htmlFor="inc-description" className="span-2">
              <TextArea
                id="inc-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Facts only: location, people involved, immediate action taken."
                disabled={Boolean(editing) && !manage}
              />
            </Field>
            {editing ? (
              <Field
                label="Resolution"
                htmlFor="inc-resolution"
                className="span-2"
                hint="Required before the incident can be marked resolved."
              >
                <TextArea
                  id="inc-resolution"
                  value={form.resolution}
                  onChange={(event) => setForm({ ...form, resolution: event.target.value })}
                  placeholder="What fixed it, who was involved, follow-up needed."
                />
              </Field>
            ) : null}
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete "${deleting?.title ?? 'incident'}"?`}
        message="The incident record and its resolution notes will be permanently deleted."
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
