import express from 'express';
import { db, nowIso } from '../db.js';
import { STAFF_ROLES, requireStaff } from '../auth.js';
import { choice, forbidden, idParam, integer, isoDateTime, likeTerm, notFound, text } from '../http.js';

export const incidentsRouter = express.Router();

export const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'];
export const INCIDENT_STATUSES = ['open', 'investigating', 'resolved'];

const INCIDENT_SELECT = `
  SELECT i.*, e.name AS event_name, v.name AS venue_name, u.name AS reporter_name
  FROM incidents i
  LEFT JOIN events e ON e.id = i.event_id
  LEFT JOIN venues v ON v.id = e.venue_id
  LEFT JOIN users u ON u.id = i.reported_by`;

function assertEvent(eventId) {
  if (!eventId) return null;
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);
  if (!event) throw notFound('Event');
  return eventId;
}

incidentsRouter.get('/', (req, res) => {
  const q = text(req.query.q, 'Search', { max: 120 });
  const severity = text(req.query.severity, 'Severity', { max: 40 });
  const status = text(req.query.status, 'Status', { max: 40 });
  const eventId = req.query.event_id ? integer(req.query.event_id, 'Event', { min: 1 }) : null;
  const clauses = [];
  const params = {};

  if (q) {
    clauses.push("(i.title LIKE @q ESCAPE '\\' OR i.description LIKE @q ESCAPE '\\' OR e.name LIKE @q ESCAPE '\\')");
    params.q = likeTerm(q);
  }
  if (severity && severity !== 'all') {
    clauses.push('i.severity = @severity');
    params.severity = severity;
  }
  if (status && status !== 'all') {
    clauses.push('i.status = @status');
    params.status = status;
  }
  if (eventId) {
    clauses.push('i.event_id = @event_id');
    params.event_id = eventId;
  }

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `${INCIDENT_SELECT}${where}
       ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1 ELSE 2 END,
         CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         i.occurred_at DESC`,
    )
    .all(params);
  res.json({ incidents: rows });
});

incidentsRouter.post('/', (req, res) => {
  const body = req.body ?? {};
  const info = db
    .prepare(
      `INSERT INTO incidents (event_id, title, description, severity, status, reported_by, occurred_at, created_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
    )
    .run(
      body.event_id ? assertEvent(integer(body.event_id, 'Event', { min: 1 })) : null,
      text(body.title, 'Incident title', { required: true, max: 200 }),
      text(body.description, 'Description', { max: 4000 }),
      choice(body.severity, 'Severity', INCIDENT_SEVERITIES, { required: false, fallback: 'medium' }),
      req.user.id,
      isoDateTime(body.occurred_at, 'Occurred at') ?? nowIso(),
      nowIso(),
    );

  res.status(201).json({ incident: db.prepare(`${INCIDENT_SELECT} WHERE i.id = ?`).get(info.lastInsertRowid) });
});

incidentsRouter.patch('/:id', (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
  if (!existing) throw notFound('Incident');

  const isStaff = STAFF_ROLES.includes(req.user.role);
  if (!isStaff && existing.reported_by !== req.user.id) throw forbidden();
  if (!isStaff && req.body?.status && req.body.status !== 'resolved') {
    throw forbidden('Only coordinators can change the investigation state');
  }

  const body = req.body ?? {};
  const status = choice(body.status, 'Status', INCIDENT_STATUSES, { required: false, fallback: existing.status });
  const resolution = body.resolution === undefined ? existing.resolution : text(body.resolution, 'Resolution', { max: 2000 });
  if (status === 'resolved' && !resolution) throw forbidden('Add a resolution note before resolving an incident');

  db.prepare(
    `UPDATE incidents SET title = ?, description = ?, severity = ?, status = ?, event_id = ?,
      resolution = ?, resolved_at = ? WHERE id = ?`,
  ).run(
    text(body.title, 'Incident title', { max: 200, fallback: existing.title }),
    body.description === undefined ? existing.description : text(body.description, 'Description', { max: 4000 }),
    choice(body.severity, 'Severity', INCIDENT_SEVERITIES, { required: false, fallback: existing.severity }),
    status,
    body.event_id === undefined ? existing.event_id : body.event_id ? assertEvent(integer(body.event_id, 'Event', { min: 1 })) : null,
    resolution,
    status === 'resolved' ? existing.resolved_at ?? nowIso() : null,
    id,
  );

  res.json({ incident: db.prepare(`${INCIDENT_SELECT} WHERE i.id = ?`).get(id) });
});

incidentsRouter.delete('/:id', requireStaff, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT id FROM incidents WHERE id = ?').get(id);
  if (!existing) throw notFound('Incident');
  db.prepare('DELETE FROM incidents WHERE id = ?').run(id);
  res.json({ ok: true });
});
