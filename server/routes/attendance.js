import express from 'express';
import { db, hoursBetween, nowIso } from '../db.js';
import { STAFF_ROLES, requireStaff } from '../auth.js';
import {
  badRequest,
  choice,
  forbidden,
  idParam,
  integer,
  isoDateTime,
  notFound,
  text,
} from '../http.js';

export const attendanceRouter = express.Router();

const ATTENDANCE_STATUSES = ['present', 'late', 'absent'];

const ATTENDANCE_SELECT = `
  SELECT at.*, u.name AS user_name, u.email AS user_email, s.title AS shift_title,
    s.starts_at AS shift_starts_at, s.ends_at AS shift_ends_at,
    e.id AS event_id, e.name AS event_name, v.name AS venue_name, r.name AS recorded_by_name
  FROM attendance at
  JOIN users u ON u.id = at.user_id
  JOIN shifts s ON s.id = at.shift_id
  JOIN events e ON e.id = s.event_id
  LEFT JOIN venues v ON v.id = e.venue_id
  LEFT JOIN users r ON r.id = at.recorded_by`;

function decorate(row) {
  if (!row) return row;
  return { ...row, hours: hoursBetween(row.checked_in_at, row.checked_out_at) };
}

attendanceRouter.get('/', (req, res) => {
  const clauses = [];
  const params = {};
  const eventId = req.query.event_id ? integer(req.query.event_id, 'Event', { min: 1 }) : null;
  const shiftId = req.query.shift_id ? integer(req.query.shift_id, 'Shift', { min: 1 }) : null;
  const userId = req.query.user_id ? integer(req.query.user_id, 'Volunteer', { min: 1 }) : null;
  const status = text(req.query.status, 'Status', { max: 40 });
  const from = isoDateTime(req.query.from, 'From');
  const to = isoDateTime(req.query.to, 'To');

  if (eventId) {
    clauses.push('e.id = @event_id');
    params.event_id = eventId;
  }
  if (shiftId) {
    clauses.push('at.shift_id = @shift_id');
    params.shift_id = shiftId;
  }
  if (userId) {
    clauses.push('at.user_id = @user_id');
    params.user_id = userId;
  }
  if (status && status !== 'all') {
    clauses.push('at.status = @status');
    params.status = status;
  }
  if (from) {
    clauses.push('COALESCE(at.checked_in_at, at.created_at) >= @from');
    params.from = from;
  }
  if (to) {
    clauses.push('COALESCE(at.checked_in_at, at.created_at) <= @to');
    params.to = to;
  }

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`${ATTENDANCE_SELECT}${where} ORDER BY COALESCE(at.checked_in_at, at.created_at) DESC LIMIT 500`).all(params);
  res.json({ attendance: rows.map(decorate) });
});

/** Staff: record or correct an attendance entry. */
attendanceRouter.post('/', requireStaff, (req, res) => {
  const shiftId = integer(req.body?.shift_id, 'Shift', { required: true, min: 1 });
  const userId = integer(req.body?.user_id, 'Volunteer', { required: true, min: 1 });
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  if (!shift) throw notFound('Shift');
  const volunteer = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!volunteer) throw notFound('Volunteer');

  const status = choice(req.body?.status, 'Status', ATTENDANCE_STATUSES, { required: false, fallback: 'present' });
  const checkedInAt = isoDateTime(req.body?.checked_in_at, 'Check-in time');
  const checkedOutAt = isoDateTime(req.body?.checked_out_at, 'Check-out time');
  if (checkedInAt && checkedOutAt && new Date(checkedOutAt) <= new Date(checkedInAt)) {
    throw badRequest('Check-out must be after check-in');
  }

  db.prepare(
    `INSERT INTO attendance (shift_id, user_id, status, checked_in_at, checked_out_at, recorded_by, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (shift_id, user_id) DO UPDATE SET
       status = excluded.status, checked_in_at = excluded.checked_in_at,
       checked_out_at = excluded.checked_out_at, recorded_by = excluded.recorded_by, notes = excluded.notes`,
  ).run(
    shiftId,
    userId,
    status,
    checkedInAt,
    checkedOutAt,
    req.user.id,
    text(req.body?.notes, 'Notes', { max: 500 }),
    nowIso(),
  );

  const row = db.prepare(`${ATTENDANCE_SELECT} WHERE at.shift_id = ? AND at.user_id = ?`).get(shiftId, userId);
  res.status(201).json({ attendance: decorate(row) });
});

function resolveTarget(req) {
  const shiftId = integer(req.body?.shift_id, 'Shift', { required: true, min: 1 });
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  if (!shift) throw notFound('Shift');

  const requested = req.body?.user_id ? integer(req.body.user_id, 'Volunteer', { min: 1 }) : req.user.id;
  if (requested !== req.user.id && !STAFF_ROLES.includes(req.user.role)) throw forbidden();
  const assignment = db
    .prepare('SELECT * FROM shift_assignments WHERE shift_id = ? AND user_id = ?')
    .get(shiftId, requested);
  if (!assignment && !STAFF_ROLES.includes(req.user.role)) {
    throw badRequest('You are not assigned to this shift');
  }
  return { shift, userId: requested };
}

attendanceRouter.post('/check-in', (req, res) => {
  const { shift, userId } = resolveTarget(req);
  const now = nowIso();
  const lateThreshold = new Date(shift.starts_at).getTime() + 15 * 60 * 1000;
  const status = Date.now() > lateThreshold ? 'late' : 'present';

  db.prepare(
    `INSERT INTO attendance (shift_id, user_id, status, checked_in_at, recorded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (shift_id, user_id) DO UPDATE SET
       status = excluded.status,
       checked_in_at = COALESCE(attendance.checked_in_at, excluded.checked_in_at),
       recorded_by = excluded.recorded_by`,
  ).run(shift.id, userId, status, now, req.user.id, now);

  const row = db.prepare(`${ATTENDANCE_SELECT} WHERE at.shift_id = ? AND at.user_id = ?`).get(shift.id, userId);
  res.json({ attendance: decorate(row) });
});

attendanceRouter.post('/check-out', (req, res) => {
  const { shift, userId } = resolveTarget(req);
  const now = nowIso();

  db.prepare(
    `INSERT INTO attendance (shift_id, user_id, status, checked_in_at, checked_out_at, recorded_by, created_at)
     VALUES (?, ?, 'present', ?, ?, ?, ?)
     ON CONFLICT (shift_id, user_id) DO UPDATE SET
       checked_out_at = excluded.checked_out_at,
       checked_in_at = COALESCE(attendance.checked_in_at, excluded.checked_in_at),
       recorded_by = excluded.recorded_by`,
  ).run(shift.id, userId, now, now, req.user.id, now);

  const row = db.prepare(`${ATTENDANCE_SELECT} WHERE at.shift_id = ? AND at.user_id = ?`).get(shift.id, userId);
  res.json({ attendance: decorate(row) });
});

attendanceRouter.delete('/:id', requireStaff, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT id FROM attendance WHERE id = ?').get(id);
  if (!existing) throw notFound('Attendance record');
  db.prepare('DELETE FROM attendance WHERE id = ?').run(id);
  res.json({ ok: true });
});
