import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { nowIso } from './db.js';
import { attachUser, purgeExpiredSessions, requireAuth } from './auth.js';
import { HttpError } from './http.js';
import { authRouter } from './routes/auth.js';
import { venuesRouter } from './routes/venues.js';
import { eventsRouter } from './routes/events.js';
import { volunteersRouter } from './routes/volunteers.js';
import { shiftsRouter } from './routes/shifts.js';
import { attendanceRouter } from './routes/attendance.js';
import { tasksRouter } from './routes/tasks.js';
import { incidentsRouter } from './routes/incidents.js';
import { dashboardRouter } from './routes/dashboard.js';
import { reportsRouter } from './routes/reports.js';
import { seedDemoData } from './seed.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(attachUser);
purgeExpiredSessions();

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'venueflow', time: nowIso() });
});

app.use('/api/auth', authRouter);

// Everything below requires an authenticated session.
app.use('/api', requireAuth);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/venues', venuesRouter);
app.use('/api/events', eventsRouter);
app.use('/api/volunteers', volunteersRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/reports', reportsRouter);

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));

const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err instanceof HttpError ? err.status : Number(err.status) || 500;
  if (status >= 500) console.error('[venueflow]', err);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on the server' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
});

if (process.env.SEED_DEMO_DATA !== 'false') {
  const result = seedDemoData();
  if (result.seeded) {
    console.log(`[venueflow] seeded demo workspace (${result.events} events, ${result.users} accounts)`);
  }
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`[venueflow] listening on http://0.0.0.0:${port}`);
});
