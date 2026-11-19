# VenueFlow

VenueFlow is an event operations platform for organisers, venue managers and volunteer
coordinators. It runs the whole operational day: venues, events, the volunteer directory, shift
scheduling with conflict detection, attendance, tasks, incident reporting, dashboards and CSV
reporting — all in one dark operational workspace backed by a real database.

This branch (`venueflow-redesign`) is the product redesign of the working `appjet` implementation.
The Express API, SQLite schema, bcrypt authentication, session handling and test suite are preserved;
the interface was rebuilt on a deliberate design system instead of ad-hoc styling.

- **Audit of both implementations:** [`docs/AUDIT.md`](docs/AUDIT.md)

## Stack

- **Client:** React 19 + TypeScript + Vite, React Router, hand-written CSS design system (no UI framework)
- **Server:** Express 5 (ES modules) serving the built client and a JSON API
- **Database:** SQLite via `better-sqlite3`, schema created on first boot
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

`npm test` runs the integration suite (`server/tests/api.test.js`): authentication, role
permissions, venue and event CRUD with validation, overlapping-shift detection, attendance
check-in/out hours, CSV export and SPA route serving.

## Demo accounts

The server seeds a demo workspace on first boot (events, venues, volunteers, shifts, attendance,
tasks and incidents). Every seeded account uses the password `Demo1234!`:

| Email | Role |
| --- | --- |
| `admin@venueflow.app` | admin |
| `organizer@venueflow.app` | organizer |
| `coordinator@venueflow.app` | coordinator |
| `sofia@venueflow.app` | volunteer |

Additional seeded volunteer accounts exist for the roster (`daniel@`, `elena@`, `hana@`, `liam@`,
`noor@`, `tom@` `venueflow.app`). Registration from the sign-in page always creates a **volunteer**;
an admin can promote a member from the Volunteers module. Seeding can be disabled with
`SEED_DEMO_DATA=false`.

## Design system

The interface is driven by tokens in `src/styles.css` rather than per-page styling:

- **Surfaces** — deep graphite and midnight layers (`--bg`, `--surface`, `--surface-2`, `--line`)
  with a single controlled accent (`--accent`, teal) and a secondary data blue.
- **Typography** — one scale for display, section, body, small and label text; tabular numerals for
  every metric and table cell so figures align.
- **Spacing** — a fixed step scale used for panels, toolbars, tables and form grids.
- **Components** — buttons (primary/secondary/ghost/danger), inputs, selects, search, textareas,
  badges with semantic tones, dense data tables, modals, toasts, and explicit loading, empty and
  error states.
- **Themes** — VenueFlow Dark, Midnight and Daylight, applied through `data-theme` on `<html>`.
- **Responsive** — the sidebar becomes a drawer below 820px; tables scroll horizontally instead of
  collapsing into unreadable cards.

Shared primitives live in `src/ui.tsx` (controls, badges, states) and `src/components/Ops.tsx`
(metric strips, panels, coverage rows, risk rails, gauges, bar charts). Pages compose these rather
than defining their own cards.

## Modules

- **Dashboard** — operational context for the next live event, staffing fill gauge, six-metric strip,
  event readiness, a "needs attention" rail (unfilled shifts, overdue tasks, urgent incidents),
  attendance performance, per-volunteer workload, upcoming schedule, recent incidents and module
  shortcuts. Every figure is computed in SQL from your records.
- **Events / Venues** — full CRUD, capacity validation, venue capacity warnings against expected
  attendees, utilisation per venue.
- **Volunteers** — directory with profiles, availability, skills, status and role management.
- **Shifts** — scheduling per event, assignment, capacity limits and overlapping-shift prevention
  (a deliberate override records the conflict).
- **Attendance** — present/late/absent, check-in and check-out with derived hours.
- **Tasks** — priority, owner, due dates and status transitions.
- **Incidents** — category, severity, coordinator assignment and resolution notes.
- **Reports** — per-dataset row counts with date filtering and real CSV downloads generated on request.
- **Settings** — profile, password change, timezone, date format and theme (stored per browser).

## Roles

`admin` and `organizer` manage everything; `coordinator` manages operational records; `volunteer`
has read access and can check in and out of their own shifts. Every `/api` route requires a session
and writes require a staff role.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (the server binds `0.0.0.0`) |
| `DATABASE_FILE` | `data/venueflow.db` | SQLite file location |
| `SEED_DEMO_DATA` | enabled | Set to `false` to start with an empty database |

Secrets are never committed and the app needs no third-party credentials to run.

## Deployment

The `Dockerfile` builds the client, prunes dev dependencies and runs as a non-root user on Alpine
with `PORT=3000`. The SQLite file lives in `/app/data`.

**Persistence limitation:** without a mounted persistent disk the database file lives inside the
container and is recreated (and reseeded) when the container is replaced. Free hosting plans do not
include persistent disks; attach one on a paid plan, or point `DATABASE_FILE` at a mounted volume,
before treating the deployment as a system of record.

## Note on Firebase

The original brief described Firebase Authentication + Firestore. The repository contains no
Firebase code, `firebase.json`, service account or `VITE_FIREBASE_*` configuration, so the running
application uses the SQLite-backed session auth described above — real password hashing, server-side
sessions, role checks and user-owned records, with no hardcoded logins. Moving to Firebase would
mean supplying a project with Email/Password and Google providers enabled plus the web config, and
replacing `server/routes/auth.js` with the Firebase SDK.
