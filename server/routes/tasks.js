import express from 'express';
import { db, nowIso } from '../db.js';
import { STAFF_ROLES, requireStaff } from '../auth.js';
import { choice, forbidden, idParam, integer, isoDateTime, likeTerm, notFound, text } from '../http.js';

export const tasksRouter = express.Router();

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const TASK_SELECT = `
  SELECT t.*, e.name AS event_name, a.name AS assignee_name, c.name AS created_by_name
  FROM tasks t
  LEFT JOIN events e ON e.id = t.event_id
  LEFT JOIN users a ON a.id = t.assignee_id
  LEFT JOIN users c ON c.id = t.created_by`;

function assertEvent(eventId) {
  if (!eventId) return null;
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);
  if (!event) throw notFound('Event');
  return eventId;
}

function assertAssignee(assigneeId) {
  if (!assigneeId) return null;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(assigneeId);
  if (!user) throw notFound('Assignee');
  return assigneeId;
}

tasksRouter.get('/', (req, res) => {
  const q = text(req.query.q, 'Search', { max: 120 });
  const status = text(req.query.status, 'Status', { max: 40 });
  const priority = text(req.query.priority, 'Priority', { max: 40 });
  const assigneeId = req.query.assignee_id ? integer(req.query.assignee_id, 'Assignee', { min: 1 }) : null;
  const eventId = req.query.event_id ? integer(req.query.event_id, 'Event', { min: 1 }) : null;
  const mine = req.query.mine === '1' || req.query.mine === 'true';
  const clauses = [];
  const params = {};

  if (q) {
    clauses.push("(t.title LIKE @q ESCAPE '\\' OR t.description LIKE @q ESCAPE '\\' OR e.name LIKE @q ESCAPE '\\')");
    params.q = likeTerm(q);
  }
  if (status && status !== 'all') {
    clauses.push('t.status = @status');
    params.status = status;
  }
  if (priority && priority !== 'all') {
    clauses.push('t.priority = @priority');
    params.priority = priority;
  }
  if (assigneeId) {
    clauses.push('t.assignee_id = @assignee_id');
    params.assignee_id = assigneeId;
  }
  if (eventId) {
    clauses.push('t.event_id = @event_id');
    params.event_id = eventId;
  }
  if (mine) {
    clauses.push('t.assignee_id = @me');
    params.me = req.user.id;
  }

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `${TASK_SELECT}${where}
       ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         COALESCE(t.due_at, '9999')`,
    )
    .all(params);
  res.json({ tasks: rows });
});

tasksRouter.post('/', requireStaff, (req, res) => {
  const body = req.body ?? {};
  const info = db
    .prepare(
      `INSERT INTO tasks (event_id, title, description, assignee_id, created_by, priority, status, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      body.event_id ? assertEvent(integer(body.event_id, 'Event', { min: 1 })) : null,
      text(body.title, 'Task title', { required: true, max: 200 }),
      text(body.description, 'Description', { max: 2000 }),
      body.assignee_id ? assertAssignee(integer(body.assignee_id, 'Assignee', { min: 1 })) : null,
      req.user.id,
      choice(body.priority, 'Priority', TASK_PRIORITIES, { required: false, fallback: 'medium' }),
      choice(body.status, 'Status', TASK_STATUSES, { required: false, fallback: 'todo' }),
      isoDateTime(body.due_at, 'Due date'),
      nowIso(),
    );

  res.status(201).json({ task: db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid) });
});

tasksRouter.patch('/:id', (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) throw notFound('Task');

  const isStaff = STAFF_ROLES.includes(req.user.role);
  const isAssignee = existing.assignee_id === req.user.id;
  if (!isStaff && !isAssignee) throw forbidden();

  const body = req.body ?? {};
  const status = choice(body.status, 'Status', TASK_STATUSES, { required: false, fallback: existing.status });

  if (!isStaff) {
    // Volunteers may only move their own task's status.
    const allowedKeys = Object.keys(body).filter((key) => body[key] !== undefined);
    if (allowedKeys.some((key) => key !== 'status')) throw forbidden('You can only update the status of your own task');
  }

  db.prepare(
    `UPDATE tasks SET title = ?, description = ?, event_id = ?, assignee_id = ?, priority = ?, status = ?,
      due_at = ?, completed_at = ? WHERE id = ?`,
  ).run(
    text(body.title, 'Task title', { max: 200, fallback: existing.title }),
    body.description === undefined ? existing.description : text(body.description, 'Description', { max: 2000 }),
    body.event_id === undefined ? existing.event_id : body.event_id ? assertEvent(integer(body.event_id, 'Event', { min: 1 })) : null,
    body.assignee_id === undefined
      ? existing.assignee_id
      : body.assignee_id
        ? assertAssignee(integer(body.assignee_id, 'Assignee', { min: 1 }))
        : null,
    choice(body.priority, 'Priority', TASK_PRIORITIES, { required: false, fallback: existing.priority }),
    status,
    body.due_at === undefined ? existing.due_at : isoDateTime(body.due_at, 'Due date'),
    status === 'done' ? existing.completed_at ?? nowIso() : null,
    id,
  );

  res.json({ task: db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) });
});

tasksRouter.delete('/:id', requireStaff, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!existing) throw notFound('Task');
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ ok: true });
});
