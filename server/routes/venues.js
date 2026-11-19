import express from 'express';
import { db, nowIso } from '../db.js';
import { requireAdmin, requireRole, requireStaff, STAFF_ROLES } from '../auth.js';
import { choice, idParam, integer, likeTerm, notFound, text } from '../http.js';

export const venuesRouter = express.Router();

const VENUE_STATUSES = ['active', 'maintenance', 'inactive'];

const VENUE_SELECT = `
  SELECT v.*,
    (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id) AS event_count,
    (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.starts_at >= @now) AS upcoming_event_count,
    (SELECT COALESCE(SUM(e.expected_attendees), 0) FROM events e WHERE e.venue_id = v.id) AS expected_attendees
  FROM venues v`;

venuesRouter.get('/', (req, res) => {
  const q = text(req.query.q, 'Search', { max: 120 });
  const status = text(req.query.status, 'Status', { max: 40 });
  const clauses = [];
  const params = { now: nowIso() };

  if (q) {
    clauses.push('(v.name LIKE @q ESCAPE \'\\\' OR v.city LIKE @q ESCAPE \'\\\' OR v.address LIKE @q ESCAPE \'\\\')');
    params.q = likeTerm(q);
  }
  if (status && status !== 'all') {
    clauses.push('v.status = @status');
    params.status = status;
  }

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`${VENUE_SELECT}${where} ORDER BY v.name COLLATE NOCASE`).all(params);
  res.json({ venues: rows });
});

venuesRouter.get('/:id', (req, res) => {
  const id = idParam(req);
  const venue = db.prepare(`${VENUE_SELECT} WHERE v.id = @id`).get({ id, now: nowIso() });
  if (!venue) throw notFound('Venue');
  const events = db
    .prepare(
      `SELECT id, name, starts_at, ends_at, status, expected_attendees
       FROM events WHERE venue_id = ? ORDER BY starts_at DESC LIMIT 25`,
    )
    .all(id);
  res.json({ venue, events });
});

venuesRouter.post('/', requireStaff, (req, res) => {
  const body = req.body ?? {};
  const venue = {
    name: text(body.name, 'Venue name', { required: true, max: 160 }),
    address: text(body.address, 'Address', { max: 240 }),
    city: text(body.city, 'City', { max: 120 }),
    capacity: integer(body.capacity, 'Capacity', { min: 0, max: 2_000_000, fallback: 0 }),
    contact_name: text(body.contact_name, 'Contact name', { max: 120 }),
    contact_email: text(body.contact_email, 'Contact email', { max: 160 }),
    contact_phone: text(body.contact_phone, 'Contact phone', { max: 40 }),
    status: choice(body.status, 'Status', VENUE_STATUSES, { required: false, fallback: 'active' }),
    notes: text(body.notes, 'Notes', { max: 2000 }),
    created_at: nowIso(),
  };

  const info = db
    .prepare(
      `INSERT INTO venues (name, address, city, capacity, contact_name, contact_email, contact_phone, status, notes, created_at)
       VALUES (@name, @address, @city, @capacity, @contact_name, @contact_email, @contact_phone, @status, @notes, @created_at)`,
    )
    .run(venue);

  res.status(201).json({ venue: db.prepare(`${VENUE_SELECT} WHERE v.id = @id`).get({ id: info.lastInsertRowid, now: nowIso() }) });
});

venuesRouter.patch('/:id', requireStaff, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  if (!existing) throw notFound('Venue');

  const body = req.body ?? {};
  const next = {
    id,
    name: text(body.name, 'Venue name', { max: 160, fallback: existing.name }),
    address: body.address === undefined ? existing.address : text(body.address, 'Address', { max: 240 }),
    city: body.city === undefined ? existing.city : text(body.city, 'City', { max: 120 }),
    capacity: body.capacity === undefined ? existing.capacity : integer(body.capacity, 'Capacity', { min: 0, max: 2_000_000 }),
    contact_name: body.contact_name === undefined ? existing.contact_name : text(body.contact_name, 'Contact name', { max: 120 }),
    contact_email: body.contact_email === undefined ? existing.contact_email : text(body.contact_email, 'Contact email', { max: 160 }),
    contact_phone: body.contact_phone === undefined ? existing.contact_phone : text(body.contact_phone, 'Contact phone', { max: 40 }),
    status: choice(body.status, 'Status', VENUE_STATUSES, { required: false, fallback: existing.status }),
    notes: body.notes === undefined ? existing.notes : text(body.notes, 'Notes', { max: 2000 }),
  };

  db.prepare(
    `UPDATE venues SET name = @name, address = @address, city = @city, capacity = @capacity,
      contact_name = @contact_name, contact_email = @contact_email, contact_phone = @contact_phone,
      status = @status, notes = @notes WHERE id = @id`,
  ).run(next);

  res.json({ venue: db.prepare(`${VENUE_SELECT} WHERE v.id = @id`).get({ id, now: nowIso() }) });
});

venuesRouter.delete('/:id', requireRole(['admin', 'organizer']), (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT id FROM venues WHERE id = ?').get(id);
  if (!existing) throw notFound('Venue');
  db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  res.json({ ok: true });
});

export { VENUE_STATUSES, STAFF_ROLES, requireAdmin };
