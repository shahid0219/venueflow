import express from 'express';
import { db, nowIso } from '../db.js';
import { ROLES, hashPassword, publicUser, requireAdmin, requireAuth, requireStaff, STAFF_ROLES } from '../auth.js';
import { badRequest, choice, email, forbidden, idParam, likeTerm, notFound, text } from '../http.js';

export const volunteersRouter = express.Router();

const HOURS_SQL = `(SELECT COALESCE(SUM(ROUND((julianday(at.checked_out_at) - julianday(at.checked_in_at)) * 24, 2)), 0)
   FROM attendance at WHERE at.user_id = u.id AND at.checked_in_at IS NOT NULL AND at.checked_out_at IS NOT NULL)`;

const VOLUNTEER_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.phone, u.city, u.skills, u.availability, u.bio, u.status, u.created_at,
    (SELECT COUNT(*) FROM shift_assignments a WHERE a.user_id = u.id) AS assignment_count,
    (SELECT COUNT(*) FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
       WHERE a.user_id = u.id AND s.starts_at >= @now AND a.status <> 'declined') AS upcoming_count,
    (SELECT COUNT(*) FROM attendance at WHERE at.user_id = u.id AND at.status IN ('present','late')) AS attended_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.status <> 'done') AS open_tasks,
    ${HOURS_SQL} AS hours
  FROM users u`;

volunteersRouter.get('/', (req, res) => {
  const q = text(req.query.q, 'Search', { max: 120 });
  const role = text(req.query.role, 'Role', { max: 40 });
  const status = text(req.query.status, 'Status', { max: 40 });
  const skill = text(req.query.skill, 'Skill', { max: 80 });
  const clauses = [];
  const params = { now: nowIso() };

  if (q) {
    clauses.push("(u.name LIKE @q ESCAPE '\\' OR u.email LIKE @q ESCAPE '\\' OR u.city LIKE @q ESCAPE '\\' OR u.skills LIKE @q ESCAPE '\\')");
    params.q = likeTerm(q);
  }
  if (role && role !== 'all') {
    clauses.push('u.role = @role');
    params.role = role;
  }
  if (status && status !== 'all') {
    clauses.push('u.status = @status');
    params.status = status;
  }
  if (skill) {
    clauses.push("u.skills LIKE @skill ESCAPE '\\'");
    params.skill = likeTerm(skill);
  }

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`${VOLUNTEER_SELECT}${where} ORDER BY u.name COLLATE NOCASE`).all(params);
  res.json({ volunteers: rows });
});

volunteersRouter.get('/:id', (req, res) => {
  const id = idParam(req);
  const volunteer = db.prepare(`${VOLUNTEER_SELECT} WHERE u.id = @id`).get({ id, now: nowIso() });
  if (!volunteer) throw notFound('Volunteer');

  const shifts = db
    .prepare(
      `SELECT a.id AS assignment_id, a.status AS assignment_status, s.id AS shift_id, s.title, s.role,
        s.starts_at, s.ends_at, s.location, e.id AS event_id, e.name AS event_name, v.name AS venue_name
       FROM shift_assignments a
       JOIN shifts s ON s.id = a.shift_id
       JOIN events e ON e.id = s.event_id
       LEFT JOIN venues v ON v.id = e.venue_id
       WHERE a.user_id = ? ORDER BY s.starts_at DESC LIMIT 50`,
    )
    .all(id);

  const attendance = db
    .prepare(
      `SELECT at.*, s.title AS shift_title, s.starts_at AS shift_starts_at, e.name AS event_name
       FROM attendance at JOIN shifts s ON s.id = at.shift_id JOIN events e ON e.id = s.event_id
       WHERE at.user_id = ? ORDER BY COALESCE(at.checked_in_at, at.created_at) DESC LIMIT 50`,
    )
    .all(id);

  const tasks = db
    .prepare(
      `SELECT t.*, e.name AS event_name FROM tasks t LEFT JOIN events e ON e.id = t.event_id
       WHERE t.assignee_id = ? ORDER BY t.status, t.due_at`,
    )
    .all(id);

  res.json({ volunteer, shifts, attendance, tasks });
});

volunteersRouter.post('/', requireStaff, (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, 'Name', { required: true, max: 120 });
  const address = email(body.email);
  const password = text(body.password, 'Temporary password', { required: true, min: 8, max: 200 });
  const role = choice(body.role, 'Role', ROLES, { required: false, fallback: 'volunteer' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(address);
  if (existing) throw badRequest('A member with that email already exists');

  const info = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, phone, city, skills, availability, bio, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(
      name,
      address,
      hashPassword(password),
      role,
      text(body.phone, 'Phone', { max: 40 }),
      text(body.city, 'City', { max: 120 }),
      text(body.skills, 'Skills', { max: 400 }),
      text(body.availability, 'Availability', { max: 400 }),
      text(body.bio, 'Bio', { max: 1000 }),
      nowIso(),
    );

  res.status(201).json({ volunteer: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)) });
});

volunteersRouter.patch('/:id', requireAuth, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) throw notFound('Volunteer');

  const isStaff = STAFF_ROLES.includes(req.user.role);
  if (!isStaff && req.user.id !== id) throw forbidden();

  const body = req.body ?? {};
  const next = {
    id,
    name: text(body.name, 'Name', { max: 120, fallback: existing.name }),
    phone: body.phone === undefined ? existing.phone : text(body.phone, 'Phone', { max: 40 }),
    city: body.city === undefined ? existing.city : text(body.city, 'City', { max: 120 }),
    skills: body.skills === undefined ? existing.skills : text(body.skills, 'Skills', { max: 400 }),
    availability: body.availability === undefined ? existing.availability : text(body.availability, 'Availability', { max: 400 }),
    bio: body.bio === undefined ? existing.bio : text(body.bio, 'Bio', { max: 1000 }),
    status: choice(body.status, 'Status', ['active', 'inactive'], { required: false, fallback: existing.status }),
  };

  db.prepare(
    `UPDATE users SET name = @name, phone = @phone, city = @city, skills = @skills,
      availability = @availability, bio = @bio, status = @status WHERE id = @id`,
  ).run(next);

  res.json({ volunteer: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

volunteersRouter.patch('/:id/role', requireAdmin, (req, res) => {
  const id = idParam(req);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) throw notFound('Volunteer');
  const role = choice(req.body?.role, 'Role', ROLES);

  if (existing.role === 'admin' && role !== 'admin') {
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get();
    if (count <= 1) throw badRequest('At least one active administrator is required');
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  res.json({ volunteer: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

volunteersRouter.delete('/:id', requireAdmin, (req, res) => {
  const id = idParam(req);
  if (id === req.user.id) throw badRequest('You cannot delete your own account');
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) throw notFound('Volunteer');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});
