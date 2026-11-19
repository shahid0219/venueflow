import express from 'express';
import { db, nowIso } from '../db.js';
import { STAFF_ROLES, requireStaff } from '../auth.js';
import {
  badRequest,
  choice,
  conflict,
  dateOrder,
  forbidden,
  idParam,
  integer,
  isoDateTime,
  likeTerm,
  notFound,
  text,
} from '../http.js';

export const shiftsRouter = express.Router();

export const ASSIGNMENT_STATUSES = ['assigned', 'confirmed', 'declined', 'completed'];

const SHIFT_SELECT = `
  SELECT s.*, e.name AS event_name, e.status AS event_status,
    v.id AS venue_id, v.name AS venue_name,
    (SELECT COUNT(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status <> 'declined') AS assigned_count,
    (SELECT COUNT(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status = 'confirmed') AS confirmed_count,
    (SELECT COUNT(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status = 'completed') AS completed_count
  FROM shifts s
  JOIN events e ON e.id = s.event_id
  LEFT JOIN venues v ON v.id = e.venue_id`;

/** Overlapping, non-declined assignments for a volunteer in the given window. */
export function findConflicts(userId, startsAt, endsAt, excludeShiftId = null) {
  return db
    .prepare(
      `SELECT s.id AS shift_id, s.title, s.starts_at, s.ends_at, e.id AS event_id, e.name AS event_name,
              (SELECT COUNT(*) FROM shift_assignments x WHERE x.shift_id = s.id) AS colleagues
       FROM shift_assignments a
       JOIN shifts s ON s.id = a.shift_id
       JOIN events e ON e.id = s.event_id
       WHERE a.user_id = @user_id
         AND a.status <> 'declined'
         AND s.id <> @exclude
         AND s.starts_at < @ends_at
         AND s.ends_at > @starts_at
       ORDER BY s.starts_at`,
    )
    .all({ user_id: userId, exclude: excludeShiftId ?? -1, starts_at: startsAt, ends_at: endsAt });
}

function assignmentRows(shiftIds) {
  if (!shiftIds.length) return [];
  const placeholders = shiftIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT a.id, a.shift_id, a.user_id, a.status, u.name, u.email, u.role, u.skills
       FROM shift_assignments a JOIN users u ON u.id = a.user_id
       WHERE a.shift_id IN (${placeholders}) ORDER BY u.name COLLATE NOCASE`,
    )
    .all(...shiftIds);
}

shiftsRouter.get('/conflicts', (req, res) => {
  const userId = integer(req.query.user_id, 'Volunteer', { required: true, min: 1 });
  const startsAt = isoDateTime(req.query.starts_at, 'Start time', { required: true });
  const endsAt = isoDateTime(req.query.ends_at, 'End time', { required: true });
  const exclude = req.query.exclude_shift_id ? integer(req.query.exclude_shift_id, 'Shift', { min: 1 }) : null;
  dateOrder(startsAt, endsAt);
  res.json({ conflicts: findConflicts(userId, startsAt, endsAt, exclude) });
});

shiftsRouter.get('/', (req, res) => {
  const q = text(req.query.q, 'Search', { max: 120 });
  const role = text(req.query.role, 'Role', { max: 80 });
  const eventId = req.query.event_id ? integer(req.query.event_id, 'Event', { min: 1 }) : null;
  const userId = req.query.user_id ? integer(req.query.user_id, 'Volunteer', { min: 1 }) : null;
  const from = isoDateTime(req.query.from, 'From');
  const to = isoDateTime(req.query.to, 'To');
  const unfilled = req.query.unfilled === '1' || req.query.unfilled === 'true';
  const clauses = [];
  const params = {};

  if (q) {
    clauses.push("(s.title LIKE @q ESCAPE '\\' OR e.name LIKE @q ESCAPE '\\' OR s.location LIKE @q ESCAPE '\\')");
    params.q = likeTerm(q);
  }
  if (role && role !== 'all') {
    clauses.push('s.role = @role');
    params.role = role;
  }
  if (eventId) {
    clauses.push('s.event_id = @event_id');
    params.event_id = eventId;
  }
  if (from) {
    clauses.push('s.ends_at >= @from');
    params.from = from;
  }
  if (to) {
    clauses.push('s.starts_at <= @to');
    params.to = to;
  }
  if (userId) {
    clauses.push('EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = s.id AND a.user_id = @user_id)');
    params.user_id = userId;
  }

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  let rows = db.prepare(`${SHIFT_SELECT}${where} ORDER BY s.starts_at`).all(params);
  if (unfilled) rows = rows.filter((row) => row.assigned_count < row.capacity);

  const assignments = assignmentRows(rows.map((r) => r.id));
  res.json({
    shifts: rows.map((shift) => ({ ...shift, assignments: assignments.filter((a) => a.shift_id === shift.id) })),
  });
});

shiftsRouter.post('/', requireStaff, (req, res) => {
  const body = req.body ?? {};
  const eventId = integer(body.event_id, 'Event', { required: true, min: 1 });
  const event = db.prepare('SELECT id, starts_at, ends_at FROM events WHERE id = ?').get(eventId);
  if (!event) throw notFound('Event');

  const startsAt = isoDateTime(body.starts_at, 'Start time', { required: true });
  const endsAt = isoDateTime(body.ends_at, 'End time', { required: true });
  dateOrder(startsAt, endsAt, 'Start time', 'End time');

  const info = db
    .prepare(
      `INSERT INTO shifts (event_id, title, role, starts_at, ends_at, capacity, location, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      eventId,
      text(body.title, 'Shift title', { required: true, max: 160 }),
      text(body.role, 'Role', { max: 80, fallback: 'general' }),
      startsAt,
      endsAt,
      integer(body.capacity, 'Capacity', { min: 1, max: 500, fallback: 1 }),
      text(body.location, 'Location', { max: 160 }),
      text(body.notes, 'Notes', { max: 2000 }),
      nowIso(),
    );

  const shift = db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ shift: { ...shift, assignments: [] } });
});

shiftsRouter.patch('/:id', requireStaff, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT * FROM shifts WHERE id = ?').get(id);
  if (!existing) throw notFound('Shift');
  const body = req.body ?? {};

  const startsAt = body.starts_at === undefined ? existing.starts_at : isoDateTime(body.starts_at, 'Start time', { required: true });
  const endsAt = body.ends_at === undefined ? existing.ends_at : isoDateTime(body.ends_at, 'End time', { required: true });
  dateOrder(startsAt, endsAt, 'Start time', 'End time');

  const capacity =
    body.capacity === undefined ? existing.capacity : integer(body.capacity, 'Capacity', { min: 1, max: 500 });
  const { assigned } = db
    .prepare("SELECT COUNT(*) AS assigned FROM shift_assignments WHERE shift_id = ? AND status <> 'declined'")
    .get(id);
  if (capacity < assigned) throw badRequest(`Capacity cannot be lower than the ${assigned} volunteers already assigned`);

  db.prepare(
    `UPDATE shifts SET title = ?, role = ?, starts_at = ?, ends_at = ?, capacity = ?, location = ?, notes = ? WHERE id = ?`,
  ).run(
    text(body.title, 'Shift title', { max: 160, fallback: existing.title }),
    text(body.role, 'Role', { max: 80, fallback: existing.role }),
    startsAt,
    endsAt,
    capacity,
    body.location === undefined ? existing.location : text(body.location, 'Location', { max: 160 }),
    body.notes === undefined ? existing.notes : text(body.notes, 'Notes', { max: 2000 }),
    id,
  );

  const shift = db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(id);
  res.json({ shift: { ...shift, assignments: assignmentRows([id]) } });
});

shiftsRouter.delete('/:id', requireStaff, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT id FROM shifts WHERE id = ?').get(id);
  if (!existing) throw notFound('Shift');
  db.prepare('DELETE FROM shifts WHERE id = ?').run(id);
  res.json({ ok: true });
});

shiftsRouter.post('/:id/assignments', requireStaff, (req, res) => {
  const shiftId = idParam(req);
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  if (!shift) throw notFound('Shift');

  const userId = integer(req.body?.user_id, 'Volunteer', { required: true, min: 1 });
  const volunteer = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(userId);
  if (!volunteer) throw notFound('Volunteer');

  const existing = db.prepare('SELECT id FROM shift_assignments WHERE shift_id = ? AND user_id = ?').get(shiftId, userId);
  if (existing) throw conflict('That volunteer is already assigned to this shift');

  const { assigned } = db
    .prepare("SELECT COUNT(*) AS assigned FROM shift_assignments WHERE shift_id = ? AND status <> 'declined'")
    .get(shiftId);
  if (assigned >= shift.capacity) {
    throw conflict(`This shift is already full (${assigned}/${shift.capacity})`);
  }

  const conflicts = findConflicts(userId, shift.starts_at, shift.ends_at, shiftId);
  const force = req.body?.force === true;
  if (conflicts.length && !force) {
    throw conflict('Scheduling conflict: this volunteer is already booked for an overlapping shift', { conflicts });
  }

  db.prepare(
    "INSERT INTO shift_assignments (shift_id, user_id, status, created_at) VALUES (?, ?, 'assigned', ?)",
  ).run(shiftId, userId, nowIso());

  res.status(201).json({
    ok: true,
    conflicts,
    shift: { ...db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(shiftId), assignments: assignmentRows([shiftId]) },
  });
});

shiftsRouter.patch('/:id/assignments/:userId', (req, res) => {
  const shiftId = idParam(req);
  const userId = idParam(req, 'userId');
  const status = choice(req.body?.status, 'Status', ASSIGNMENT_STATUSES);

  const assignment = db.prepare('SELECT * FROM shift_assignments WHERE shift_id = ? AND user_id = ?').get(shiftId, userId);
  if (!assignment) throw notFound('Assignment');

  const isStaff = STAFF_ROLES.includes(req.user.role);
  if (!isStaff) {
    if (req.user.id !== userId) throw forbidden();
    if (!['confirmed', 'declined'].includes(status)) throw forbidden('Volunteers can confirm or decline their own shifts');
  }

  db.prepare('UPDATE shift_assignments SET status = ? WHERE id = ?').run(status, assignment.id);
  res.json({ ok: true, shift: { ...db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(shiftId), assignments: assignmentRows([shiftId]) } });
});

shiftsRouter.delete('/:id/assignments/:userId', (req, res) => {
  const shiftId = idParam(req);
  const userId = idParam(req, 'userId');
  const assignment = db.prepare('SELECT * FROM shift_assignments WHERE shift_id = ? AND user_id = ?').get(shiftId, userId);
  if (!assignment) throw notFound('Assignment');
  if (!STAFF_ROLES.includes(req.user.role) && req.user.id !== userId) throw forbidden();

  db.prepare('DELETE FROM shift_assignments WHERE id = ?').run(assignment.id);
  db.prepare('DELETE FROM attendance WHERE shift_id = ? AND user_id = ?').run(shiftId, userId);
  res.json({ ok: true });
});
