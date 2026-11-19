import express from 'express';
import { db, nowIso } from '../db.js';
import {
  ROLES,
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  parseCookies,
  publicUser,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import { badRequest, email, forbidden, text, unauthorized } from '../http.js';

export const authRouter = express.Router();

/** Very small in-memory throttle: 8 failed attempts per email+IP per 15 minutes. */
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function attemptKey(req, address) {
  return `${req.ip || 'unknown'}:${address}`;
}

function tooManyAttempts(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) attempts.set(key, { first: Date.now(), count: 1 });
  else entry.count += 1;
}

authRouter.post('/register', (req, res) => {
  const name = text(req.body?.name, 'Name', { required: true, max: 120 });
  const address = email(req.body?.email);
  const password = text(req.body?.password, 'Password', { required: true, min: 8, max: 200 });
  const city = text(req.body?.city, 'City', { max: 120 });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(address);
  if (existing) throw badRequest('An account with that email already exists');

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  const role = count === 0 ? 'admin' : 'volunteer';

  const info = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, city, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(name, address, hashPassword(password), role, city, nowIso());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const session = createSession(user.id);
  setSessionCookie(req, res, session.token, session.expiresAt);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const address = email(req.body?.email);
  const password = text(req.body?.password, 'Password', { required: true, max: 200 });
  const key = attemptKey(req, address);

  if (tooManyAttempts(key)) {
    throw badRequest('Too many failed sign-in attempts. Please try again in a few minutes.');
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(address);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailure(key);
    throw unauthorized('Email or password is incorrect');
  }
  if (user.status !== 'active') throw forbidden('This account has been deactivated. Contact an administrator.');

  attempts.delete(key);
  const session = createSession(user.id);
  setSessionCookie(req, res, session.token, session.expiresAt);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  deleteSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRouter.patch('/profile', (req, res) => {
  if (!req.user) throw unauthorized();
  const name = text(req.body?.name, 'Name', { max: 120, fallback: req.user.name });
  const phone = text(req.body?.phone, 'Phone', { max: 40 });
  const city = text(req.body?.city, 'City', { max: 120 });
  const skills = text(req.body?.skills, 'Skills', { max: 400 });
  const availability = text(req.body?.availability, 'Availability', { max: 400 });
  const bio = text(req.body?.bio, 'Bio', { max: 1000 });

  db.prepare(
    `UPDATE users SET name = ?, phone = ?, city = ?, skills = ?, availability = ?, bio = ? WHERE id = ?`,
  ).run(name, phone, city, skills, availability, bio, req.user.id);

  const newPassword = text(req.body?.new_password, 'New password', { min: 8, max: 200 });
  if (newPassword) {
    const current = text(req.body?.current_password, 'Current password', { required: true, max: 200 });
    if (!verifyPassword(current, req.user.password_hash)) throw badRequest('Current password is incorrect');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  }

  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

export { ROLES };
