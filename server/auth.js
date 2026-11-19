import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, nowIso } from './db.js';
import { forbidden, unauthorized } from './http.js';

export const SESSION_COOKIE = 'vf_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export const ROLES = ['admin', 'organizer', 'coordinator', 'volunteer'];
/** Roles allowed to create/update operational records. */
export const STAFF_ROLES = ['admin', 'organizer', 'coordinator'];

export const hashPassword = (password) => bcrypt.hashSync(password, 10);
export const verifyPassword = (password, hash) => bcrypt.compareSync(password, hash);
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    nowIso(),
    expiresAt,
  );
  return { token, expiresAt };
}

export function deleteSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}

export function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    if (key) acc[key] = decodeURIComponent(part.slice(idx + 1).trim());
    return acc;
  }, {});
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    city: row.city,
    skills: row.skills,
    availability: row.availability,
    bio: row.bio,
    status: row.status,
    created_at: row.created_at,
  };
}

export function sessionUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`,
    )
    .get(sha256(token), nowIso());
  return row || null;
}

export function attachUser(req, _res, next) {
  req.user = sessionUser(req);
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!allowed.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const requireStaff = requireRole(STAFF_ROLES);
export const requireAdmin = requireRole('admin');

export function setSessionCookie(req, res, token, expiresAt) {
  const secure = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Can the actor edit records owned by this user / change this assignment? */
export function canManage(actor, ownerId) {
  if (!actor) return false;
  if (actor.role === 'admin' || actor.role === 'organizer') return true;
  if (actor.role === 'coordinator') return true;
  return actor.id === ownerId;
}
