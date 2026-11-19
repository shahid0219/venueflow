import express from 'express';
import { db, hoursBetween } from '../db.js';
import { csvResponse, isoDateTime, notFound, toCsv } from '../http.js';

export const reportsRouter = express.Router();

const dateWindow = (column, from, to, params) => {
  const parts = [];
  if (from) {
    parts.push(`${column} >= @from`);
    params.from = from;
  }
  if (to) {
    parts.push(`${column} <= @to`);
    params.to = to;
  }
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
};

const iso = (value) => (value ? String(value) : '');

/** Every exportable dataset is defined once so counts and CSV stay consistent. */
const DATASETS = {
  events: {
    label: 'Events',
    description: 'Every event with venue, schedule, staffing and operational counters.',
    columns: [
      { label: 'Event ID', value: (r) => r.id },
      { label: 'Name', value: (r) => r.name },
      { label: 'Category', value: (r) => r.category },
      { label: 'Status', value: (r) => r.status },
      { label: 'Venue', value: (r) => r.venue_name },
      { label: 'City', value: (r) => r.venue_city },
      { label: 'Starts at', value: (r) => iso(r.starts_at) },
      { label: 'Ends at', value: (r) => iso(r.ends_at) },
      { label: 'Organiser', value: (r) => r.organiser_name },
      { label: 'Expected attendees', value: (r) => r.expected_attendees },
      { label: 'Shifts', value: (r) => r.shift_count },
      { label: 'Slots filled', value: (r) => r.slots_filled },
      { label: 'Slots total', value: (r) => r.slots_total },
    ],
    rows: ({ from, to }) => {
      const params = {};
      const where = dateWindow('e.starts_at', from, to, params);
      return db
        .prepare(
          `SELECT e.*, v.name AS venue_name, v.city AS venue_city, u.name AS organiser_name,
            (SELECT COUNT(*) FROM shifts s WHERE s.event_id = e.id) AS shift_count,
            (SELECT COALESCE(SUM(s.capacity), 0) FROM shifts s WHERE s.event_id = e.id) AS slots_total,
            (SELECT COUNT(*) FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE s.event_id = e.id) AS slots_filled
           FROM events e LEFT JOIN venues v ON v.id = e.venue_id LEFT JOIN users u ON u.id = e.organiser_id
           ${where} ORDER BY e.starts_at`,
        )
        .all(params);
    },
  },
  venues: {
    label: 'Venues',
    description: 'Venue register with capacity and utilisation counters.',
    columns: [
      { label: 'Venue ID', value: (r) => r.id },
      { label: 'Name', value: (r) => r.name },
      { label: 'Address', value: (r) => r.address },
      { label: 'City', value: (r) => r.city },
      { label: 'Capacity', value: (r) => r.capacity },
      { label: 'Status', value: (r) => r.status },
      { label: 'Contact', value: (r) => r.contact_name },
      { label: 'Contact email', value: (r) => r.contact_email },
      { label: 'Contact phone', value: (r) => r.contact_phone },
      { label: 'Events hosted', value: (r) => r.event_count },
    ],
    rows: () =>
      db
        .prepare(
          `SELECT v.*, (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id) AS event_count
           FROM venues v ORDER BY v.name COLLATE NOCASE`,
        )
        .all(),
  },
  volunteers: {
    label: 'Volunteers',
    description: 'Directory with roles, availability and logged hours.',
    columns: [
      { label: 'Member ID', value: (r) => r.id },
      { label: 'Name', value: (r) => r.name },
      { label: 'Email', value: (r) => r.email },
      { label: 'Role', value: (r) => r.role },
      { label: 'Status', value: (r) => r.status },
      { label: 'Phone', value: (r) => r.phone },
      { label: 'City', value: (r) => r.city },
      { label: 'Skills', value: (r) => r.skills },
      { label: 'Availability', value: (r) => r.availability },
      { label: 'Assignments', value: (r) => r.assignment_count },
      { label: 'Hours logged', value: (r) => r.hours },
    ],
    rows: () =>
      db
        .prepare(
          `SELECT u.*,
            (SELECT COUNT(*) FROM shift_assignments a WHERE a.user_id = u.id) AS assignment_count,
            (SELECT COALESCE(SUM(ROUND((julianday(at.checked_out_at) - julianday(at.checked_in_at)) * 24, 2)), 0)
               FROM attendance at WHERE at.user_id = u.id AND at.checked_in_at IS NOT NULL AND at.checked_out_at IS NOT NULL) AS hours
           FROM users u ORDER BY u.name COLLATE NOCASE`,
        )
        .all(),
    dateColumn: 'u.created_at',
  },
  shifts: {
    label: 'Shifts',
    description: 'Shift schedule with staffing levels and fill status.',
    columns: [
      { label: 'Shift ID', value: (r) => r.id },
      { label: 'Event', value: (r) => r.event_name },
      { label: 'Title', value: (r) => r.title },
      { label: 'Role', value: (r) => r.role },
      { label: 'Starts at', value: (r) => iso(r.starts_at) },
      { label: 'Ends at', value: (r) => iso(r.ends_at) },
      { label: 'Capacity', value: (r) => r.capacity },
      { label: 'Assigned', value: (r) => r.assigned_count },
      { label: 'Location', value: (r) => r.location },
    ],
    rows: ({ from, to }) => {
      const params = {};
      const where = dateWindow('s.starts_at', from, to, params);
      return db
        .prepare(
          `SELECT s.*, e.name AS event_name,
            (SELECT COUNT(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status <> 'declined') AS assigned_count
           FROM shifts s JOIN events e ON e.id = s.event_id ${where} ORDER BY s.starts_at`,
        )
        .all(params);
    },
  },
  assignments: {
    label: 'Shift assignments',
    description: 'Who is booked on which shift, including confirmation state.',
    columns: [
      { label: 'Assignment ID', value: (r) => r.id },
      { label: 'Event', value: (r) => r.event_name },
      { label: 'Shift', value: (r) => r.shift_title },
      { label: 'Volunteer', value: (r) => r.volunteer_name },
      { label: 'Email', value: (r) => r.volunteer_email },
      { label: 'Shift role', value: (r) => r.role },
      { label: 'Status', value: (r) => r.status },
      { label: 'Starts at', value: (r) => iso(r.starts_at) },
      { label: 'Ends at', value: (r) => iso(r.ends_at) },
    ],
    rows: ({ from, to }) => {
      const params = {};
      const where = dateWindow('s.starts_at', from, to, params);
      return db
        .prepare(
          `SELECT a.id, a.status, u.name AS volunteer_name, u.email AS volunteer_email,
            s.title AS shift_title, s.role, s.starts_at, s.ends_at, e.name AS event_name
           FROM shift_assignments a
           JOIN users u ON u.id = a.user_id
           JOIN shifts s ON s.id = a.shift_id
           JOIN events e ON e.id = s.event_id
           ${where} ORDER BY s.starts_at, u.name`,
        )
        .all(params);
    },
  },
  attendance: {
    label: 'Attendance',
    description: 'Check-in and check-out records with derived hours.',
    columns: [
      { label: 'Record ID', value: (r) => r.id },
      { label: 'Event', value: (r) => r.event_name },
      { label: 'Shift', value: (r) => r.shift_title },
      { label: 'Volunteer', value: (r) => r.user_name },
      { label: 'Status', value: (r) => r.status },
      { label: 'Checked in', value: (r) => iso(r.checked_in_at) },
      { label: 'Checked out', value: (r) => iso(r.checked_out_at) },
      { label: 'Hours', value: (r) => hoursBetween(r.checked_in_at, r.checked_out_at) },
      { label: 'Recorded by', value: (r) => r.recorded_by_name },
      { label: 'Notes', value: (r) => r.notes },
    ],
    rows: ({ from, to }) => {
      const params = {};
      const where = dateWindow('COALESCE(at.checked_in_at, at.created_at)', from, to, params);
      return db
        .prepare(
          `SELECT at.*, u.name AS user_name, s.title AS shift_title, e.name AS event_name, r.name AS recorded_by_name
           FROM attendance at
           JOIN users u ON u.id = at.user_id
           JOIN shifts s ON s.id = at.shift_id
           JOIN events e ON e.id = s.event_id
           LEFT JOIN users r ON r.id = at.recorded_by
           ${where} ORDER BY COALESCE(at.checked_in_at, at.created_at) DESC`,
        )
        .all(params);
    },
  },
  tasks: {
    label: 'Tasks',
    description: 'Operational task list with owners, priorities and due dates.',
    columns: [
      { label: 'Task ID', value: (r) => r.id },
      { label: 'Title', value: (r) => r.title },
      { label: 'Event', value: (r) => r.event_name },
      { label: 'Assignee', value: (r) => r.assignee_name },
      { label: 'Priority', value: (r) => r.priority },
      { label: 'Status', value: (r) => r.status },
      { label: 'Due at', value: (r) => iso(r.due_at) },
      { label: 'Completed at', value: (r) => iso(r.completed_at) },
      { label: 'Created at', value: (r) => iso(r.created_at) },
    ],
    rows: ({ from, to }) => {
      const params = {};
      const where = dateWindow('t.created_at', from, to, params);
      return db
        .prepare(
          `SELECT t.*, e.name AS event_name, a.name AS assignee_name
           FROM tasks t LEFT JOIN events e ON e.id = t.event_id LEFT JOIN users a ON a.id = t.assignee_id
           ${where} ORDER BY t.created_at`,
        )
        .all(params);
    },
  },
  incidents: {
    label: 'Incidents',
    description: 'Incident register with severity, ownership and resolution notes.',
    columns: [
      { label: 'Incident ID', value: (r) => r.id },
      { label: 'Title', value: (r) => r.title },
      { label: 'Event', value: (r) => r.event_name },
      { label: 'Severity', value: (r) => r.severity },
      { label: 'Status', value: (r) => r.status },
      { label: 'Reported by', value: (r) => r.reporter_name },
      { label: 'Occurred at', value: (r) => iso(r.occurred_at) },
      { label: 'Resolved at', value: (r) => iso(r.resolved_at) },
      { label: 'Resolution', value: (r) => r.resolution },
      { label: 'Description', value: (r) => r.description },
    ],
    rows: ({ from, to }) => {
      const params = {};
      const where = dateWindow('i.occurred_at', from, to, params);
      return db
        .prepare(
          `SELECT i.*, e.name AS event_name, u.name AS reporter_name
           FROM incidents i LEFT JOIN events e ON e.id = i.event_id LEFT JOIN users u ON u.id = i.reported_by
           ${where} ORDER BY i.occurred_at DESC`,
        )
        .all(params);
    },
  },
};

function filters(req) {
  return {
    from: isoDateTime(req.query.from, 'From date'),
    to: isoDateTime(req.query.to, 'To date'),
  };
}

reportsRouter.get('/', (req, res) => {
  const { from, to } = filters(req);
  const datasets = Object.entries(DATASETS).map(([id, dataset]) => {
    const rows = dataset.rows({ from, to });
    return { id, label: dataset.label, description: dataset.description, row_count: rows.length };
  });
  res.json({ datasets, from, to });
});

reportsRouter.get('/:dataset/download', (req, res) => {
  const dataset = DATASETS[req.params.dataset];
  if (!dataset) throw notFound('Report');
  const { from, to } = filters(req);
  const rows = dataset.rows({ from, to });
  const stamp = new Date().toISOString().slice(0, 10);
  csvResponse(res, `venueflow-${req.params.dataset}-${stamp}.csv`, toCsv(dataset.columns, rows));
});

export { DATASETS };
