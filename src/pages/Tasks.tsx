import { useState, type FormEvent } from 'react';
import { api, ApiError, queryString, useDebounced, useFetch } from '../api';
import { canManage, useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDateTime, fromInputValue, relativeTime, toInputValue } from '../format';
import type { EventRecord, TaskRecord, Volunteer } from '../types';
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

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;

type FormState = {
  title: string;
  description: string;
  event_id: string;
  assignee_id: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  due_at: string;
};

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  event_id: '',
  assignee_id: '',
  priority: 'medium',
  status: 'todo',
  due_at: '',
};

function priorityTone(priority: string) {
  if (priority === 'urgent') return 'danger' as const;
  if (priority === 'high') return 'warning' as const;
  if (priority === 'medium') return 'info' as const;
  return 'neutral' as const;
}

export default function Tasks() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const debounced = useDebounced(search);

  const list = useFetch<{ tasks: TaskRecord[] }>(
    `/api/tasks${queryString({
      q: debounced,
      status: statusFilter,
      priority: priorityFilter,
      mine: mineOnly ? 1 : '',
    })}`,
  );
  const events = useFetch<{ events: EventRecord[] }>('/api/events');
  const volunteers = useFetch<{ volunteers: Volunteer[] }>('/api/volunteers?status=active');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TaskRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const manage = canManage(user);
  const eventOptions = events.data?.events ?? [];
  const volunteerOptions = volunteers.data?.volunteers ?? [];

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, assignee_id: mineOnly && user ? String(user.id) : '' });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(task: TaskRecord) {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? '',
      event_id: task.event_id ? String(task.event_id) : '',
      assignee_id: task.assignee_id ? String(task.assignee_id) : '',
      priority: task.priority,
      status: task.status,
      due_at: toInputValue(task.due_at),
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_id: form.event_id ? Number(form.event_id) : null,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        priority: form.priority,
        status: form.status,
        due_at: form.due_at ? fromInputValue(form.due_at) : null,
      };
      if (editing) {
        await api(`/api/tasks/${editing.id}`, { method: 'PATCH', body: payload });
        push('Task updated');
      } else {
        await api('/api/tasks', { method: 'POST', body: payload });
        push('Task created');
      }
      setFormOpen(false);
      list.reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Unable to save this task');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(task: TaskRecord, status: string) {
    try {
      await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status } });
      list.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to update the task', 'error');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/tasks/${deleting.id}`, { method: 'DELETE' });
      push('Task deleted');
      setDeleting(null);
      list.reload();
    } catch (caught) {
      push(caught instanceof ApiError ? caught.message : 'Unable to delete this task', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = list.data?.tasks ?? [];
  const open = rows.filter((task) => task.status !== 'done').length;

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Operational to-dos with owners, priorities and deadlines."
        actions={
          <Button variant="primary" icon="plus" onClick={openCreate}>
            New task
          </Button>
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tasks…" />
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
        <Select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value)}
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </Select>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(event) => setMineOnly(event.target.checked)}
          />
          <span className="small">Assigned to me</span>
        </label>
        <Button icon="refresh" onClick={list.reload}>
          Refresh
        </Button>
      </div>

      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <Badge tone="info">{open} open</Badge>
        <Badge tone="neutral">{rows.length} in view</Badge>
      </div>

      <Card>
        {list.loading && rows.length === 0 ? (
          <LoadingBlock label="Loading tasks…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="check"
            title="No tasks here"
            description={
              search || statusFilter || priorityFilter || mineOnly
                ? 'No tasks match these filters.'
                : 'Create a task to track operational work across your events.'
            }
            action={
              <Button variant="primary" icon="plus" onClick={openCreate}>
                New task
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Event</th>
                  <th>Assignee</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => {
                  const canEdit = manage || task.assignee_id === user?.id;
                  return (
                    <tr key={task.id}>
                      <td>
                        <span className="cell-strong">{task.title}</span>
                        {task.description ? (
                          <span className="row-sub truncate">{task.description}</span>
                        ) : null}
                      </td>
                      <td className="cell-muted">{task.event_name ?? '—'}</td>
                      <td className="cell-muted">{task.assignee_name ?? 'Unassigned'}</td>
                      <td>
                        <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                      </td>
                      <td className="cell-muted">
                        {task.due_at ? (
                          <span
                            className={task.overdue && task.status !== 'done' ? 'text-danger' : undefined}
                            title={formatDateTime(task.due_at, prefs)}
                          >
                            {relativeTime(task.due_at, prefs)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <Select
                            value={task.status}
                            aria-label={`Status for ${task.title}`}
                            onChange={(event) => changeStatus(task, event.target.value)}
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <StatusBadge status={task.status} />
                        )}
                      </td>
                      <td>
                        <div className="cell-actions">
                          {canEdit ? (
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => openEdit(task)}
                              aria-label={`Edit ${task.title}`}
                              title="Edit"
                            >
                              <Icon name="edit" size={15} />
                            </button>
                          ) : null}
                          {manage ? (
                            <button
                              type="button"
                              className="icon-btn danger"
                              onClick={() => setDeleting(task)}
                              aria-label={`Delete ${task.title}`}
                              title="Delete"
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
        title={editing ? 'Edit task' : 'New task'}
        onClose={() => setFormOpen(false)}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <FormError message={formError} />
          <div className="form-grid">
            <Field label="Title" htmlFor="task-title" required className="span-2">
              <TextInput
                id="task-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Confirm radio hire for main stage"
                required
              />
            </Field>
            <Field label="Event" htmlFor="task-event">
              <Select
                id="task-event"
                value={form.event_id}
                onChange={(event) => setForm({ ...form, event_id: event.target.value })}
              >
                <option value="">No event</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignee" htmlFor="task-assignee">
              <Select
                id="task-assignee"
                value={form.assignee_id}
                onChange={(event) => setForm({ ...form, assignee_id: event.target.value })}
                disabled={!manage && !editing}
              >
                <option value="">Unassigned</option>
                {volunteerOptions.map((volunteer) => (
                  <option key={volunteer.id} value={volunteer.id}>
                    {volunteer.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="task-priority">
              <Select
                id="task-priority"
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value as FormState['priority'] })
                }
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="task-status">
              <Select
                id="task-status"
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
            <Field label="Due (UTC)" htmlFor="task-due" className="span-2">
              <TextInput
                id="task-due"
                type="datetime-local"
                value={form.due_at}
                onChange={(event) => setForm({ ...form, due_at: event.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor="task-description" className="span-2">
              <TextArea
                id="task-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What needs to happen, and anything the owner should know."
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete "${deleting?.title ?? 'task'}"?`}
        message="This task will be permanently removed. This cannot be undone."
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
