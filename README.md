# VenueFlow

VenueFlow is an event operations management platform for event organisers, venue managers and volunteer
coordinators. It covers venues, events, the volunteer directory, shift scheduling with conflict detection,
attendance, tasks, incident reporting, dashboard statistics and CSV reports in one dark SaaS workspace.

## Stack

- **Client:** React 19 + TypeScript + Vite, React Router, hand-written CSS design system (no UI framework)
- **Server:** Express 5 (ES modules) serving the built client and a JSON API
- **Database:** SQLite via `better-sqlite3` with a versioned schema created on first boot
- **Auth:** email + password (bcrypt), server-side sessions in an httpOnly `vf_session` cookie
- **Tests:** `node:test` integration suite that boots the real server against a throwaway database

No paid services or paid dependencies are required.

## Quick start

```bash
npm install
npm run dev        # API on :3000 (watch) + Vite dev server on :5173
```

Production build and run:

```bash
npm run build      # tsc -b && vite build  →  dist/
npm start          # Express serves dist/ and /api on :3000
```

`npm test` runs the integration suite (`server/tests/api.test.js`), which covers authentication,
role permissions, venue/event CRUD and validation, overlapping-shift detection, attendance
check-in/out and CSV export.

## Demo accounts

The server seeds a demo workspace on first boot (events, venues, volunteers, shifts, attendance,
tasks and incidents). Every seeded account uses the password `Demo1234!`:

| Email | Role |
| --- | --- |
| `admin@venueflow.app` | admin |
| `organizer@venueflow.app` | organizer |
| `coordinator@venueflow.app` | coordinator |
| `sofia@venueflow.app` | volunteer |

Registration from the sign-in page always creates a **volunteer**; an admin can promote a member
to coordinator or organiser from the Volunteers module. Seeding can be disabled with
`SEED_DEMO_DATA=false`.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (the server binds `0.0.0.0`) |
| `DATABASE_FILE` | `data/venueflow.db` | SQLite file location |
| `SEED_DEMO_DATA` | enabled | Set to `false` to start with an empty database |

Secrets are never committed; the app needs no third-party credentials to run.

## Modules

- **Dashboard** — live totals, attendance rate, staffing fill rate, upcoming events, shifts at risk,
  recent incidents and an activity feed, all computed in SQL.
- **Events / Venues** — full CRUD, capacity validation, venue capacity warnings against expected attendees.
- **Volunteers** — directory with profiles, availability, skills, status and role management.
- **Shifts** — scheduling per event, assignment, capacity limits and overlapping-shift prevention
  (a deliberate override records the conflict).
- **Attendance** — present/late/absent, check-in and check-out with derived hours.
- **Tasks** — priority, owner, due dates and status transitions.
- **Incidents** — category, severity, coordinator assignment and resolution notes.
- **Reports** — per-dataset row counts with date filtering and real CSV downloads generated on request.
- **Settings** — profile, password change, timezone, date format and theme (stored per browser).

## Roles

`admin` and `organizer` manage everything; `coordinator` manages operational records;
`volunteer` has read access and can check in/out of their own shifts. Every API route below
`/api` requires a session, and writes require a staff role.

## Deployment

The included `Dockerfile` builds the client, prunes dev dependencies and runs as a non-root user on
Alpine with `PORT=3000`. The SQLite file lives in `/app/data`; on hosts without a persistent disk the
database is recreated and reseeded when the container is replaced.

## Note on Firebase

The original brief described Firebase Authentication + Firestore. This repository contained no
Firebase code, `firebase.json`, service account or `VITE_FIREBASE_*` configuration, so the running
application uses the SQLite-backed session auth described above — real password hashing, server-side
sessions, role checks and user-owned records, with no hardcoded logins. To move to Firebase instead,
supply a Firebase project with Email/Password and Google providers enabled plus the web config, and
the `server/routes/auth.js` session layer would be replaced by the Firebase SDK — see the notes in the
handover for the exact configuration values required.
