# VenueFlow — Phase 1 Audit

Date: 2026-11-19
Branches inspected: `appjet` (deployed), `venueflow-redesign` (new, branched from `appjet`)
Baseline commit: `d32c676` — *chore: ignore build output, local database and env files*

---

## 1. Original Google AI Studio source — recovery status

**Status: not recoverable from this repository or its project history.**

Evidence:

| Check | Result |
| --- | --- |
| Repository file tree at `d32c676` | 48 tracked files, all written in this workspace. No `firestore.rules`, `firebase.json`, `src/lib/firebase.ts`, `src/contexts/AuthContext.tsx` or any Firebase import. |
| `grep -r "firebase"` across the repo | No matches. |
| Project history search for the AI Studio export | Only the request text describing it; no attached codebase, archive or file listing. |
| Git history | Five commits, all from the initial scaffold onward (`4446401` Dockerfile, `930f753`, `d32c676`). No import commit of an external source tree. |

**What this means.** The multi-file Firebase codebase described in the brief was never delivered into this repository, so there is nothing to preserve, archive or port. Rather than fabricate a "recovered original", the working implementation built on `appjet` is the authoritative source and is preserved intact:

- `appjet` branch — untouched, still deployed at https://xftyvw6o1f.dev.onappjet.com
- `venueflow-redesign` branch — branched from `appjet` at `d32c676`; all redesign work happens here
- `docs/ORIGINAL-SOURCE-RECOVERY.md` — how to supply the original export if you want it merged

## 2. Current implementation inventory

Architecture actually present (differs from the brief's assumption of Firebase):

| Layer | Implementation |
| --- | --- |
| Client | React 18 + TypeScript + Vite, React Router 6, hand-rolled SVG icon set, custom CSS design system |
| Server | Express 4 on Node, `better-sqlite3` (WAL), session cookies, `bcryptjs` hashing |
| Auth | Email/password registration + login, httpOnly `vf_session` cookie, SHA-256 session tokens in `sessions` table, role checks (`admin`, `organizer`, `coordinator`, `volunteer`) |
| Data | SQLite file in `DATA_DIR` (`/app/data/venueflow.db`), idempotent demo seed |
| API | `/api/auth`, `/api/events`, `/api/venues`, `/api/volunteers`, `/api/shifts`, `/api/attendance`, `/api/tasks`, `/api/incidents`, `/api/dashboard`, `/api/reports`, `/api/settings` |
| Tests | `server/tests/api.test.js` — 10 integration checks against a live server |
| Deploy | Alpine multi-stage Dockerfile, non-root, port 3000 |

Feature coverage by module:

| Module | State | Notes |
| --- | --- | --- |
| Dashboard | Working, generic | Real SQL aggregates; seven visually similar metric cards, weak hierarchy |
| Events | Working CRUD | Venue capacity + time-order validation, status/venue filters, search |
| Venues | Working CRUD | Capacity validation against events |
| Volunteers | Working CRUD | Availability, skills, contact, role elevation (admin only) |
| Shifts | Working | Create/assign/remove, overlap detection with explicit override |
| Attendance | Working | present/late/absent, check-in/out, derived hours |
| Tasks | Working | Priority, assignee, due date, status flow |
| Incidents | Working | Category, severity, coordinator, resolution |
| Reports | Working | Aggregates + real CSV downloads |
| Settings | Working | Profile, password change, timezone, date format, theme |

## 3. Reuse / adapt / keep / missing

**Reuse unchanged (do not rewrite):**
- `server/*` — Express app, routers, SQLite schema and seed, validation helpers
- `server/auth.js` — password hashing, session creation, cookie handling, role gates
- `server/tests/api.test.js` — the integration contract
- `src/api.ts`, `src/auth.tsx`, `src/prefs.tsx`, `src/format.ts`, `src/types.ts` — client data layer
- Every API route shape consumed by the pages

**Adapt (design layer only):**
- `src/styles.css` — replaced by a token-driven design system
- `src/components/Shell.tsx` — navigation rail, contextual topbar, mobile drawer
- `src/ui.tsx` — same exported component API, refined visuals plus new primitives
- `src/pages/Dashboard.tsx` — restructured around operational hierarchy
- Page-level headers, toolbars, tables, empty/loading/error states — inherit from the design system

**Keep as-is by policy:**
- `appjet` branch and its live deployment
- Existing database schema (no destructive migrations)
- Existing authorization checks and validation
- `.gitignore`, Dockerfile contract (port 3000, non-root, Alpine)

**Missing relative to the brief (documented, not faked):**
- Firebase Authentication / Firestore — never existed here; the brief's Phase 4 items (Google sign-in, email verification, password reset) require a Firebase project. Password reset and email verification also need an SMTP/Firebase mail path. None is stubbed or pretended.
- `main` branch does not exist on the remote, so the pull request target must be created from `appjet` before opening the PR.
