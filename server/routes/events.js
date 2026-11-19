import express from 'express';
import { db, nowIso } from '../db.js';
import { requireRole, requireStaff } from '../auth.js';
import { choice, dateOrder, idParam, integer, isoDateTime, likeTerm, notFound, text } from '../http.js';

export const eventsRouter = express.Router();

export const EVENT_STATUSES = ['draft', 'published', 'live', 'completed', 'cancelled'];

const EVENT_SELECT = `
  SELECT e.*, v.name AS venue_name, v.city AS venue_city, v.capacity AS venue_capacity,
    u.name AS organiser_name,
    (SELECT COUNT(*) FROM shifts s WHERE s.event_id = e.id) AS shift_count,
    (SELECT COALESCE(SUM(s.capacity), 0) FROM shifts s WHERE s.event_id = e.id) AS slots_total,
    (SELECT COUNT(*) FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE s.event_id = e.id) AS slots_filled,
    (SELECT COUNT(*) FROM tasks t WHERE t.event_id = e.id AND t.status <> 'done') AS open_tasks,
    (SELECT COUNT(*) FROM incidents i WHERE i.event_id = e.id AND i.status <> 'resolved') AS open_incidents
  FROM events e
  LEFT JOIN venues v ON v.id = e.venue_id
  LEFT JOIN users u ON u.id = e.organiser_id`;

function assertVenue(venueId) {
  if (venueId === null || venueId === undefined) return null;
  const venue = db.prepare('SELECT id FROM venues WHERE id = ?').get(venueId);
  if (!venue) throw notFound('Venue');
  return venueId;
}

eventsRouter.get('/', (req, res) => {
  const q = text(req.query.q, 'Search', { max: 120 });
  const status = text(req.query.status, 'Status', { max: 40 });
  const venueId = req.query.venue_id ? integer(req.query.venue_id, 'Venue', { min: 1 }) : null;
  const scope = text(req.query.scope, 'Scope', { max: 20 });
  const clauses = [];
  const params = {};

  if (q) {
    clauses.push("(e.name LIKE @q ESCAPE '\\' OR e.description LIKE @q ESCAPE '\\' OR v.name LIKE @q ESCAPE '\\')");
    params.q = likeTerm(q);
  }
  if (status && status !== 'all') {
    clauses.push('e.status = @status');
    params.status = status;
  }
  if (venueId) {
    clauses.push('e.venue_id = @venue_id');
    params.venue_id = venueId;
  }
  if (scope === 'upcoming') clauses.push('e.ends_at >= @now');
  if (scope === 'past') clauses.push('e.ends_at < @now');
  params.now = nowIso();

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`${EVENT_SELECT}${where} ORDER BY e.starts_at ${scope === 'past' ? 'DESC' : 'ASC'}`)
    .all(params);
  res.json({ events: rows });
});

eventsRouter.get('/:id', (req, res) => {
  const id = idParam(req);
  const event = db.prepare(`${EVENT_SELECT} WHERE e.id = @id`).get({ id });
  if (!event) throw notFound('Event');

  const shifts = db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM shift_assignments a WHERE a.shift_id = s.id) AS assigned_count
       FROM shifts s WHERE s.event_id = ? ORDER BY s.starts_at`,
    )
    .all(id);

  const assignments = db
    .prepare(
      `SELECT a.id, a.shift_id, a.user_id, a.status, u.name AS user_name, u.role AS user_role
       FROM shift_assignments a JOIN users u ON u.id = a.user_id
       JOIN shifts s ON s.id = a.shift_id WHERE s.event_id = ? ORDER BY u.name`,
    )
    .all(id);

  const tasks = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.event_id = ? ORDER BY t.status, t.due_at`,
    )
    .all(id);

  const incidents = db
    .prepare(
      `SELECT i.*, u.name AS reporter_name FROM incidents i LEFT JOIN users u ON u.id = i.reported_by
       WHERE i.event_id = ? ORDER BY i.occurred_at DESC`,
    )
    .all(id);

  const attendance = db
    .prepare(
      `SELECT at.*, u.name AS user_name FROM attendance at
       JOIN users u ON u.id = at.user_id
       JOIN shifts s ON s.id = at.shift_id
       WHERE s.event_id = ? ORDER BY at.checked_in_at DESC`,
    )
    .all(id);

  res.json({
    event,
    shifts: shifts.map((shift) => ({
      ...shift,
      assignments: assignments.filter((a) => a.shift_id === shift.id),
    })),
    tasks,
    incidents,
    attendance,
  });
});

eventsRouter.post('/', requireStaff, (req, res) => {
  const body = req.body ?? {};
  const startsAt = isoDateTime(body.starts_at, 'Start time', { required: true });
  const endsAt = isoDateTime(body.ends_at, 'End time', { required: true });
  dateOrder(startsAt, endsAt, 'Start time', 'End time');

  const record = {
    name: text(body.name, 'Event name', { required: true, max: 160 }),
    description: text(body.description, 'Description', { max: 4000 }),
    venue_id: assertVenue(body.venue_id ? integer(body.venue_id, 'Venue', { min: 1 }) : null),
    organiser_id: req.user.id,
    category: text(body.category, 'Category', { max: 80, fallback: 'General' }),
    starts_at: startsAt,
    ends_at: endsAt,
    status: choice(body.status, 'Status', EVENT_STATUSES, { required: false, fallback: 'draft' }),
    expected_attendees: integer(body.expected_attendees, 'Expected attendees', { min: 0, max: 1_000_000, fallback: 0 }),
    created_at: nowIso(),
  };

  const info = db
    .prepare(
      `INSERT INTO events (name, description, venue_id, organiser_id, category, starts_at, ends_at, status, expected_attendees, created_at)
       VALUES (@name, @description, @venue_id, @organiser_id, @category, @starts_at, @ends_at, @status, @expected_attendees, @created_at)`,
    )
    .run(record);

  res.status(201).json({ event: db.prepare(`${EVENT_SELECT} WHERE e.id = @id`).get({ id: info.lastInsertRowid }) });
});

eventsRouter.patch('/:id', requireStaff, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!existing) throw notFound('Event');
  const body = req.body ?? {};

  const startsAt = body.starts_at === undefined ? existing.starts_at : isoDateTime(body.starts_at, 'Start time', { required: true });
  const endsAt = body.ends_at === undefined ? existing.ends_at : isoDateTime(body.ends_at, 'End time', { required: true });
  dateOrder(startsAt, endsAt, 'Start time', 'End time');

  const next = {
    id,
    name: text(body.name, 'Event name', { max: 160, fallback: existing.name }),
    description: body.description === undefined ? existing.description : text(body.description, 'Description', { max: 4000 }),
    venue_id: body.venue_id === undefined ? existing.venue_id : assertVenue(body.venue_id ? integer(body.venue_id, 'Venue', { min: 1 }) : null),
    category: body.category === undefined ? existing.category : text(body.category, 'Category', { max: 80 }),
    starts_at: startsAt,
    ends_at: endsAt,
    status: choice(body.status, 'Status', EVENT_STATUSES, { required: false, fallback: existing.status }),
    expected_attendees:
      body.expected_attendees === undefined
        ? existing.expected_attendees
        : integer(body.expected_attendees, 'Expected attendees', { min: 0, max: 1_000_000 }),
  };

  db.prepare(
    `UPDATE events SET name = @name, description = @description, venue_id = @venue_id, category = @category,
      starts_at = @starts_at, ends_at = @ends_at, status = @status, expected_attendees = @expected_attendees
     WHERE id = @id`,
  ).run(next);

  res.json({ event: db.prepare(`${EVENT_SELECT} WHERE e.id = @id`).get({ id }) });
});

eventsRouter.delete('/:id', requireRole(['admin', 'organizer']), (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
  if (!existing) throw notFound('Event');
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  res.json({ ok: true });
});
