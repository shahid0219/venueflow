import express from 'express';
import { db, nowIso } from '../db.js';

export const dashboardRouter = express.Router();

const num = (value) => Number(value || 0);

dashboardRouter.get('/', (req, res) => {
  const now = nowIso();
  const userId = req.user.id;

  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM events) AS events_total,
        (SELECT COUNT(*) FROM events WHERE ends_at >= @now AND status <> 'cancelled') AS events_upcoming,
        (SELECT COUNT(*) FROM events WHERE status = 'live') AS events_live,
        (SELECT COUNT(*) FROM venues) AS venues,
        (SELECT COUNT(*) FROM venues WHERE status = 'active') AS venues_active,
        (SELECT COUNT(*) FROM users WHERE role = 'volunteer') AS volunteers,
        (SELECT COUNT(*) FROM users WHERE role IN ('admin','organizer','coordinator')) AS staff,
        (SELECT COUNT(*) FROM users WHERE status = 'active') AS members_active,
        (SELECT COUNT(*) FROM tasks WHERE status <> 'done') AS open_tasks,
        (SELECT COUNT(*) FROM tasks WHERE status <> 'done' AND due_at IS NOT NULL AND due_at < @now) AS overdue_tasks,
        (SELECT COUNT(*) FROM incidents WHERE status <> 'resolved') AS open_incidents,
        (SELECT COUNT(*) FROM incidents WHERE status <> 'resolved' AND severity IN ('high','critical')) AS urgent_incidents,
        (SELECT COUNT(*) FROM shifts WHERE ends_at >= @now) AS shifts_upcoming,
        (SELECT COUNT(*) FROM shifts s WHERE s.ends_at >= @now AND
           (SELECT COUNT(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status <> 'declined') < s.capacity) AS shifts_understaffed,
        (SELECT COALESCE(SUM(capacity), 0) FROM shifts WHERE ends_at >= @now) AS slots_total,
        (SELECT COUNT(*) FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
           WHERE s.ends_at >= @now AND a.status <> 'declined') AS slots_filled`,
    )
    .get({ now });

  const attendance = db
    .prepare(
      `SELECT COUNT(*) AS records,
        COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) AS present,
        COALESCE(SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END), 0) AS late,
        COALESCE(SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END), 0) AS absent,
        COALESCE(SUM(CASE WHEN checked_in_at IS NOT NULL AND checked_out_at IS NOT NULL
          THEN ROUND((julianday(checked_out_at) - julianday(checked_in_at)) * 24, 2) ELSE 0 END), 0) AS hours
       FROM attendance`,
    )
    .get();

  const tasksByStatus = db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all();
  const incidentsBySeverity = db
    .prepare('SELECT severity, COUNT(*) AS count FROM incidents WHERE status <> \'resolved\' GROUP BY severity')
    .all();

  const upcomingEvents = db
    .prepare(
      `SELECT e.id, e.name, e.status, e.starts_at, e.ends_at, e.expected_attendees, e.category,
        v.name AS venue_name,
        (SELECT COUNT(*) FROM shifts s WHERE s.event_id = e.id) AS shift_count,
        (SELECT COALESCE(SUM(s.capacity), 0) FROM shifts s WHERE s.event_id = e.id) AS slots_total,
        (SELECT COUNT(*) FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE s.event_id = e.id) AS slots_filled,
        (SELECT COUNT(*) FROM tasks t WHERE t.event_id = e.id AND t.status <> 'done') AS open_tasks,
        (SELECT COUNT(*) FROM incidents i WHERE i.event_id = e.id AND i.status <> 'resolved') AS open_incidents
       FROM events e LEFT JOIN venues v ON v.id = e.venue_id
       WHERE e.ends_at >= @now AND e.status <> 'cancelled'
       ORDER BY e.starts_at LIMIT 5`,
    )
    .all({ now });

  const shiftsAtRisk = db
    .prepare(
      `SELECT s.id, s.title, s.role, s.starts_at, s.ends_at, s.capacity,
        e.id AS event_id, e.name AS event_name, v.name AS venue_name,
        (SELECT COUNT(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status <> 'declined') AS assigned_count
       FROM shifts s JOIN events e ON e.id = s.event_id LEFT JOIN venues v ON v.id = e.venue_id
       WHERE s.ends_at >= @now AND
         (SELECT COUNT(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status <> 'declined') < s.capacity
       ORDER BY s.starts_at LIMIT 6`,
    )
    .all({ now });

  const recentIncidents = db
    .prepare(
      `SELECT i.id, i.title, i.severity, i.status, i.occurred_at, e.name AS event_name, u.name AS reporter_name
       FROM incidents i LEFT JOIN events e ON e.id = i.event_id LEFT JOIN users u ON u.id = i.reported_by
       ORDER BY i.occurred_at DESC LIMIT 5`,
    )
    .all();

  const since = new Date(Date.now() - 13 * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const activityRows = db
    .prepare(
      `SELECT substr(COALESCE(checked_in_at, created_at), 1, 10) AS date, COUNT(*) AS check_ins
       FROM attendance WHERE COALESCE(checked_in_at, created_at) >= @since
       GROUP BY date ORDER BY date`,
    )
    .all({ since: since.toISOString() });

  const activity = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(since.getTime() + index * 86_400_000);
    const key = day.toISOString().slice(0, 10);
    const match = activityRows.find((row) => row.date === key);
    return { date: key, check_ins: match ? num(match.check_ins) : 0 };
  });

  const myShifts = db
    .prepare(
      `SELECT s.id, s.title, s.role, s.starts_at, s.ends_at, s.location, a.status AS assignment_status,
        e.id AS event_id, e.name AS event_name, v.name AS venue_name
       FROM shift_assignments a
       JOIN shifts s ON s.id = a.shift_id
       JOIN events e ON e.id = s.event_id
       LEFT JOIN venues v ON v.id = e.venue_id
       WHERE a.user_id = @user_id AND s.ends_at >= @now
       ORDER BY s.starts_at LIMIT 5`,
    )
    .all({ user_id: userId, now });

  const mine = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM tasks WHERE assignee_id = @user_id AND status <> 'done') AS open_tasks,
        (SELECT COUNT(*) FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
           WHERE a.user_id = @user_id AND s.ends_at >= @now AND a.status <> 'declined') AS upcoming_shifts,
        (SELECT COALESCE(SUM(ROUND((julianday(at.checked_out_at) - julianday(at.checked_in_at)) * 24, 2)), 0)
           FROM attendance at WHERE at.user_id = @user_id
             AND at.checked_in_at IS NOT NULL AND at.checked_out_at IS NOT NULL) AS hours`,
    )
    .get({ user_id: userId, now });

  const attendanceTotal = num(attendance.present) + num(attendance.late) + num(attendance.absent);
  const attendanceRate = attendanceTotal
    ? Math.round(((num(attendance.present) + num(attendance.late)) / attendanceTotal) * 1000) / 10
    : 0;
  const fillRate = num(counts.slots_total)
    ? Math.round((num(counts.slots_filled) / num(counts.slots_total)) * 1000) / 10
    : 0;

  res.json({
    generated_at: now,
    totals: {
      events_total: num(counts.events_total),
      events_upcoming: num(counts.events_upcoming),
      events_live: num(counts.events_live),
      venues: num(counts.venues),
      venues_active: num(counts.venues_active),
      volunteers: num(counts.volunteers),
      staff: num(counts.staff),
      members_active: num(counts.members_active),
      open_tasks: num(counts.open_tasks),
      overdue_tasks: num(counts.overdue_tasks),
      open_incidents: num(counts.open_incidents),
      urgent_incidents: num(counts.urgent_incidents),
      shifts_upcoming: num(counts.shifts_upcoming),
      shifts_understaffed: num(counts.shifts_understaffed),
      slots_total: num(counts.slots_total),
      slots_filled: num(counts.slots_filled),
      fill_rate: fillRate,
    },
    attendance: {
      records: num(attendance.records),
      present: num(attendance.present),
      late: num(attendance.late),
      absent: num(attendance.absent),
      hours: Math.round(num(attendance.hours) * 100) / 100,
      rate: attendanceRate,
    },
    tasks_by_status: tasksByStatus,
    incidents_by_severity: incidentsBySeverity,
    upcoming_events: upcomingEvents,
    shifts_at_risk: shiftsAtRisk,
    recent_incidents: recentIncidents,
    activity,
    mine: {
      open_tasks: num(mine.open_tasks),
      upcoming_shifts: num(mine.upcoming_shifts),
      hours: Math.round(num(mine.hours) * 100) / 100,
      shifts: myShifts,
    },
  });
});
