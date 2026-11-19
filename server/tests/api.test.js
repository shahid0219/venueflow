import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

/**
 * End-to-end API checks against a real server process with a throwaway SQLite file.
 * These cover the workflows the UI depends on: authentication, database-driven
 * dashboard statistics, CRUD, overlapping-shift detection, attendance and CSV export.
 */

const PORT = 4700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venueflow-test-'));
const dbFile = path.join(tmpDir, 'venueflow.db');
const DEMO_PASSWORD = 'Demo1234!';

let server;
let cookie = '';

async function request(pathname, { method = 'GET', body, authenticated = true, raw = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authenticated && cookie) headers.Cookie = cookie;

  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

  for (const value of response.headers.getSetCookie?.() ?? []) {
    const pair = value.split(';')[0];
    if (pair.startsWith('vf_session=')) cookie = pair;
  }

  if (raw) return response;
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, body: json, text, headers: response.headers };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Server did not become ready in time');
}

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATABASE_FILE: dbFile, SEED_DEMO_DATA: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  await waitForServer();
});

after(() => {
  server?.kill('SIGTERM');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('health endpoint is public and unauthenticated API access is rejected', async () => {
  const health = await request('/api/health', { authenticated: false });
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);

  const dashboard = await request('/api/dashboard', { authenticated: false });
  assert.equal(dashboard.status, 401);
});

test('login rejects bad credentials and accepts the seeded admin', async () => {
  const bad = await request('/api/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { email: 'admin@venueflow.app', password: 'wrong-password' },
  });
  assert.equal(bad.status, 401);

  const good = await request('/api/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { email: 'admin@venueflow.app', password: DEMO_PASSWORD },
  });
  assert.equal(good.status, 200);
  assert.equal(good.body.user.role, 'admin');
  assert.ok(cookie, 'session cookie should be issued');

  const me = await request('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'admin@venueflow.app');
});

test('dashboard statistics come from the database', async () => {
  const { status, body } = await request('/api/dashboard');
  assert.equal(status, 200);
  assert.ok(body.totals, 'dashboard returns totals');
  assert.ok(body.totals.events_total >= 1, 'seeded events are counted');
  assert.equal(typeof body.totals.volunteers, 'number');
  assert.equal(typeof body.attendance.records, 'number');
});

test('venue creation validates capacity and persists', async () => {
  const invalid = await request('/api/venues', {
    method: 'POST',
    body: { name: 'Bad Hall', capacity: -10 },
  });
  assert.equal(invalid.status, 400);

  const created = await request('/api/venues', {
    method: 'POST',
    body: { name: 'Test Hall', city: 'Leeds', capacity: 200 },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.venue.name, 'Test Hall');

  const list = await request('/api/venues?q=Test%20Hall');
  assert.equal(list.status, 200);
  assert.ok(list.body.venues.some((venue) => venue.id === created.body.venue.id));
});

test('events validate date order and are created against a venue', async () => {
  const venue = await request('/api/venues', {
    method: 'POST',
    body: { name: 'Event Venue', capacity: 300 },
  });
  assert.equal(venue.status, 201);

  const badOrder = await request('/api/events', {
    method: 'POST',
    body: {
      name: 'Backwards Event',
      starts_at: '2030-06-01T18:00:00.000Z',
      ends_at: '2030-06-01T09:00:00.000Z',
    },
  });
  assert.equal(badOrder.status, 400);

  const created = await request('/api/events', {
    method: 'POST',
    body: {
      name: 'Summer Operations Test',
      venue_id: venue.body.venue.id,
      starts_at: '2030-06-01T09:00:00.000Z',
      ends_at: '2030-06-01T18:00:00.000Z',
      expected_attendees: 250,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.event.name, 'Summer Operations Test');
  assert.equal(created.body.event.venue_id, venue.body.venue.id);
});

test('overlapping shift assignments are blocked unless forced', async () => {
  const event = await request('/api/events', {
    method: 'POST',
    body: {
      name: 'Conflict Event',
      starts_at: '2031-05-10T08:00:00.000Z',
      ends_at: '2031-05-10T20:00:00.000Z',
    },
  });
  assert.equal(event.status, 201);
  const eventId = event.body.event.id;

  const first = await request('/api/shifts', {
    method: 'POST',
    body: {
      event_id: eventId,
      title: 'Morning gate',
      role: 'steward',
      starts_at: '2031-05-10T09:00:00.000Z',
      ends_at: '2031-05-10T12:00:00.000Z',
      capacity: 3,
    },
  });
  assert.equal(first.status, 201);

  const second = await request('/api/shifts', {
    method: 'POST',
    body: {
      event_id: eventId,
      title: 'Midday gate',
      role: 'steward',
      starts_at: '2031-05-10T11:00:00.000Z',
      ends_at: '2031-05-10T14:00:00.000Z',
      capacity: 3,
    },
  });
  assert.equal(second.status, 201);

  const volunteers = await request('/api/volunteers?q=sofia');
  assert.equal(volunteers.status, 200);
  const volunteer = volunteers.body.volunteers.find((row) => row.email === 'sofia@venueflow.app');
  assert.ok(volunteer, 'seeded volunteer exists');

  const assignFirst = await request(`/api/shifts/${first.body.shift.id}/assignments`, {
    method: 'POST',
    body: { user_id: volunteer.id },
  });
  assert.equal(assignFirst.status, 201);

  const clashing = await request(`/api/shifts/${second.body.shift.id}/assignments`, {
    method: 'POST',
    body: { user_id: volunteer.id },
  });
  assert.equal(clashing.status, 409);
  assert.match(clashing.body.error, /conflict/i);

  const conflicts = await request(
    `/api/shifts/conflicts?user_id=${volunteer.id}&starts_at=2031-05-10T11:00:00.000Z&ends_at=2031-05-10T14:00:00.000Z`,
  );
  assert.equal(conflicts.status, 200);
  assert.ok(conflicts.body.conflicts.length >= 1);

  const forced = await request(`/api/shifts/${second.body.shift.id}/assignments`, {
    method: 'POST',
    body: { user_id: volunteer.id, force: true },
  });
  assert.equal(forced.status, 201);
});

test('attendance records check-in and check-out hours', async () => {
  const shifts = await request('/api/shifts?q=Morning%20gate');
  assert.equal(shifts.status, 200);
  const shift = shifts.body.shifts.find((row) => row.title === 'Morning gate');
  assert.ok(shift, 'shift from the conflict scenario exists');

  const volunteers = await request('/api/volunteers?q=sofia');
  const volunteer = volunteers.body.volunteers.find((row) => row.email === 'sofia@venueflow.app');

  const checkIn = await request('/api/attendance/check-in', {
    method: 'POST',
    body: { shift_id: shift.id, user_id: volunteer.id },
  });
  assert.equal(checkIn.status, 200);
  assert.ok(['present', 'late'].includes(checkIn.body.attendance.status));
  assert.ok(checkIn.body.attendance.checked_in_at);

  const checkOut = await request('/api/attendance/check-out', {
    method: 'POST',
    body: { shift_id: shift.id, user_id: volunteer.id },
  });
  assert.equal(checkOut.status, 200);
  assert.ok(checkOut.body.attendance.checked_out_at);
  assert.equal(typeof checkOut.body.attendance.hours, 'number');
});

test('reports expose datasets and a real CSV download', async () => {
  const report = await request('/api/reports');
  assert.equal(report.status, 200);
  const events = report.body.datasets.find((dataset) => dataset.id === 'events');
  assert.ok(events, 'events dataset is listed');
  assert.ok(events.row_count >= 1);

  const csv = await request('/api/reports/events/download', { raw: true });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
  const body = await csv.text();
  const [header, ...rows] = body.trim().split(/\r?\n/);
  assert.match(header, /name/i);
  assert.ok(rows.length >= 1, 'CSV contains data rows');
});

test('volunteers cannot perform staff-only writes', async () => {
  cookie = '';
  const login = await request('/api/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { email: 'sofia@venueflow.app', password: DEMO_PASSWORD },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'volunteer');

  const forbidden = await request('/api/venues', {
    method: 'POST',
    body: { name: 'Volunteer Attempt', capacity: 10 },
  });
  assert.equal(forbidden.status, 403);
});

test('the built SPA is served for client routes', async () => {
  const response = await request('/volunteers', { raw: true });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<div id="root">/);
});
