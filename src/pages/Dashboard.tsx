import { Link } from 'react-router-dom';
import { useFetch } from '../api';
import { useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDate, formatDateTime, relativeTime } from '../format';
import type { DashboardData } from '../types';
import { Badge, EmptyState, ErrorNote, Icon, LoadingBlock, PageHeader, StatusBadge } from '../ui';
import {
  BarChart,
  CoverageRow,
  Gauge,
  Metric,
  MetricStrip,
  ModuleTile,
  Panel,
  RailItem,
  Split,
} from '../components/Ops';

export default function Dashboard() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<DashboardData>('/api/dashboard');

  if (loading) return <LoadingBlock label="Loading operational dashboard…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const { totals, attendance } = data;
  const nextEvent = data.upcoming_events[0];
  const tasksTotal = data.tasks_by_status.reduce((sum, row) => sum + row.count, 0);
  const understaffed = totals.shifts_understaffed;

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={`Operational snapshot · refreshed ${relativeTime(data.generated_at, prefs)}`}
        actions={
          <>
            <Link className="btn" to="/reports">
              <Icon name="chart" size={14} />
              Reports
            </Link>
            <Link className="btn btn-primary" to="/shifts">
              <Icon name="clock" size={14} />
              Schedule a shift
            </Link>
          </>
        }
      />

      {/* ---------------------- current operational context --------------------- */}
      <div className="ops-hero">
        <section className="ops-context">
          <div className="ops-context-top">
            <div className="stack-sm">
              <span className="page-eyebrow">Next on the floor</span>
              {nextEvent ? (
                <>
                  <h2>{nextEvent.name}</h2>
                  <div className="ops-context-meta">
                    <span>
                      <Icon name="pin" size={13} />
                      {nextEvent.venue_name ?? 'Venue to be confirmed'}
                    </span>
                    <span>
                      <Icon name="calendar" size={13} />
                      {formatDateTime(nextEvent.starts_at, prefs)}
                    </span>
                    <span>
                      <Icon name="users" size={13} />
                      {nextEvent.expected_attendees.toLocaleString()} expected
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h2>No events on the calendar</h2>
                  <p className="small muted">
                    Create an event to start scheduling volunteers, tasks and incident cover.
                  </p>
                </>
              )}
            </div>
            {nextEvent ? <StatusBadge status={nextEvent.status} /> : null}
          </div>

          {nextEvent ? (
            <div className="stack-sm">
              <CoverageRow
                name="Volunteer staffing"
                meta={`${nextEvent.shift_count} shift${nextEvent.shift_count === 1 ? '' : 's'} scheduled`}
                filled={nextEvent.slots_filled}
                capacity={nextEvent.slots_total}
              />
            </div>
          ) : null}

          <div className="ops-context-foot">
            {nextEvent ? (
              <>
                <span className="row tiny">
                  <Icon name="clipboard" size={13} />
                  {nextEvent.open_tasks} open task{nextEvent.open_tasks === 1 ? '' : 's'}
                </span>
                <span className="row tiny">
                  <Icon name="alert" size={13} />
                  {nextEvent.open_incidents} open incident{nextEvent.open_incidents === 1 ? '' : 's'}
                </span>
                <div className="topbar-spacer" />
                <Link className="btn btn-sm" to="/events">
                  Event workspace
                  <Icon name="arrow" size={13} />
                </Link>
              </>
            ) : (
              <Link className="btn btn-sm btn-primary" to="/events">
                <Icon name="plus" size={13} />
                Create an event
              </Link>
            )}
          </div>
        </section>

        <Panel
          title="Staffing health"
          subtitle="Upcoming shifts only"
          action={
            <Link className="btn btn-sm btn-ghost" to="/shifts">
              Roster
            </Link>
          }
        >
          <Gauge
            percent={totals.fill_rate}
            value={`${totals.fill_rate}%`}
            label="Slots filled"
            caption={`${totals.slots_filled} of ${totals.slots_total} volunteer slots covered`}
          />
          <div className="stack-sm">
            <div className="spread small">
              <span className="muted">Shifts scheduled</span>
              <span className="numeric" style={{ color: 'var(--text)' }}>
                {totals.shifts_upcoming}
              </span>
            </div>
            <div className="spread small">
              <span className="muted">Understaffed shifts</span>
              <span className="numeric" style={{ color: understaffed ? 'var(--warning)' : 'var(--text)' }}>
                {understaffed}
              </span>
            </div>
            <div className="spread small">
              <span className="muted">Attendance rate</span>
              <span className="numeric" style={{ color: 'var(--text)' }}>
                {attendance.rate}%
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* ----------------------------- key metrics ----------------------------- */}
      <MetricStrip>
        <Metric
          icon="calendar"
          label="Upcoming events"
          value={totals.events_upcoming}
          foot={`${totals.events_live} live · ${totals.events_total} total`}
        />
        <Metric
          icon="building"
          label="Active venues"
          value={totals.venues_active}
          foot={`${totals.venues} in the register`}
        />
        <Metric
          icon="users"
          label="Volunteers"
          value={totals.volunteers}
          foot={`${totals.staff} staff · ${totals.members_active} active`}
        />
        <Metric
          icon="clock"
          label="Open slots"
          value={Math.max(0, totals.slots_total - totals.slots_filled)}
          foot={`${totals.fill_rate}% of demand covered`}
        />
        <Metric
          icon="clipboard"
          label="Open tasks"
          value={totals.open_tasks}
          foot={
            totals.overdue_tasks > 0 ? (
              <span style={{ color: 'var(--danger)' }}>{totals.overdue_tasks} overdue</span>
            ) : (
              'Nothing overdue'
            )
          }
        />
        <Metric
          icon="alert"
          label="Open incidents"
          value={totals.open_incidents}
          foot={
            totals.urgent_incidents > 0 ? (
              <span style={{ color: 'var(--danger)' }}>{totals.urgent_incidents} high or critical</span>
            ) : (
              'No urgent reports'
            )
          }
        />
      </MetricStrip>

      {/* ------------------------- readiness + risk rail ----------------------- */}
      <Split>
        <Panel
          title="Event readiness"
          subtitle="Staffing, tasks and incidents per upcoming event"
          action={
            <Link className="btn btn-sm btn-ghost" to="/events">
              All events
            </Link>
          }
        >
          {data.upcoming_events.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No upcoming events"
              description="Once an event is scheduled, its staffing and workload appear here."
              action={
                <Link className="btn btn-sm btn-primary" to="/events">
                  Create event
                </Link>
              }
            />
          ) : (
            <div className="stack-sm">
              {data.upcoming_events.map((event) => (
                <div className="coverage-row" key={event.id}>
                  <div className="coverage-name">
                    <strong>{event.name}</strong>
                    <span>
                      {formatDate(event.starts_at, prefs)} · {event.venue_name ?? 'Venue TBC'} ·{' '}
                      {event.category ?? 'Uncategorised'}
                    </span>
                  </div>
                  <div className="coverage-bar">
                    <div
                      className="progress"
                      role="progressbar"
                      aria-valuenow={Math.round(
                        (event.slots_filled / Math.max(1, event.slots_total)) * 100,
                      )}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${event.name} staffing`}
                    >
                      <span
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((event.slots_filled / Math.max(1, event.slots_total)) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="tiny subtle numeric">
                      {event.slots_filled}/{event.slots_total} slots · {event.open_tasks} tasks ·{' '}
                      {event.open_incidents} incidents
                    </span>
                  </div>
                  <StatusBadge status={event.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="stack">
          <Panel title="Needs attention" subtitle="Derived from live records">
            <div className="rail-list">
              <RailItem
                to="/shifts"
                title="Understaffed shifts"
                sub="Upcoming shifts below capacity"
                count={understaffed}
                tone={understaffed > 0 ? 'warning' : 'neutral'}
              />
              <RailItem
                to="/tasks"
                title="Overdue tasks"
                sub="Past their deadline and still open"
                count={totals.overdue_tasks}
                tone={totals.overdue_tasks > 0 ? 'danger' : 'neutral'}
              />
              <RailItem
                to="/incidents"
                title="Open incidents"
                sub={`${totals.urgent_incidents} high or critical`}
                count={totals.open_incidents}
                tone={totals.urgent_incidents > 0 ? 'danger' : 'neutral'}
              />
              <RailItem
                to="/attendance"
                title="Absences recorded"
                sub={`${attendance.records} check-ins logged`}
                count={attendance.absent}
                tone={attendance.absent > 0 ? 'info' : 'neutral'}
              />
            </div>
          </Panel>

          <Panel
            title="Staffing risk"
            subtitle="Shifts closest to going short"
            action={
              <Link className="btn btn-sm btn-ghost" to="/shifts">
                Scheduling
              </Link>
            }
          >
            {data.shifts_at_risk.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title="Every shift is fully staffed"
                description="Upcoming shifts all have enough volunteers assigned."
              />
            ) : (
              <div className="list" style={{ marginBottom: 0 }}>
                {data.shifts_at_risk.slice(0, 4).map((shift) => (
                  <div className="list-row" key={shift.id}>
                    <div className="list-main">
                      <span className="list-title">{shift.title}</span>
                      <span className="list-sub">
                        {shift.event_name} · {formatDateTime(shift.starts_at, prefs)}
                      </span>
                    </div>
                    <div className="list-end">
                      <Badge tone="warning">
                        {Math.max(0, shift.capacity - shift.assigned_count)} open
                      </Badge>
                      <span className="tiny subtle numeric">
                        {shift.assigned_count}/{shift.capacity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </Split>

      {/* --------------------- attendance / workload split --------------------- */}
      <Split even>
        <Panel
          title="Attendance"
          subtitle={`${attendance.records} records · ${attendance.hours} hours logged`}
          action={
            <Link className="btn btn-sm btn-ghost" to="/attendance">
              Check-in desk
            </Link>
          }
        >
          <div className="split split-even" style={{ gap: 'var(--s-6)' }}>
            <Gauge
              percent={attendance.rate}
              value={`${attendance.rate}%`}
              label="Attendance rate"
              caption="Present or late against all records"
            />
            <div className="stack-sm">
              <div className="spread small">
                <span className="muted">Present</span>
                <span className="numeric" style={{ color: 'var(--success)' }}>
                  {attendance.present}
                </span>
              </div>
              <div className="spread small">
                <span className="muted">Late</span>
                <span className="numeric" style={{ color: 'var(--warning)' }}>
                  {attendance.late}
                </span>
              </div>
              <div className="spread small">
                <span className="muted">Absent</span>
                <span className="numeric" style={{ color: 'var(--danger)' }}>
                  {attendance.absent}
                </span>
              </div>
            </div>
          </div>
          <div>
            <span className="tiny subtle">Check-ins, last 14 days</span>
            <BarChart
              label="Volunteer check-ins over the last 14 days"
              points={data.activity.map((point) => ({
                label: point.date.slice(8),
                value: point.check_ins,
              }))}
            />
          </div>
        </Panel>

        <Panel
          title="Workload & risk register"
          subtitle={`${tasksTotal} tasks tracked`}
          action={
            <Link className="btn btn-sm btn-ghost" to="/tasks">
              Task board
            </Link>
          }
        >
          <div className="stack-sm">
            {data.tasks_by_status.length === 0 ? (
              <EmptyState icon="clipboard" title="No tasks yet" description="Tasks appear here once created." />
            ) : (
              data.tasks_by_status.map((row) => {
                const pct = tasksTotal ? Math.round((row.count / tasksTotal) * 100) : 0;
                return (
                  <div className="row" key={row.status}>
                    <div style={{ width: 104 }}>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className={`progress ${row.status === 'blocked' ? 'warn' : ''}`} style={{ flex: 1 }}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tiny subtle numeric" style={{ width: 54, textAlign: 'right' }}>
                      {row.count} · {pct}%
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="divider" />

          <div className="stack-sm">
            <span className="tiny subtle">Incidents by severity</span>
            {data.incidents_by_severity.length === 0 ? (
              <span className="small muted">No incidents reported.</span>
            ) : (
              <div className="chart-legend" style={{ gap: 'var(--s-4)' }}>
                {data.incidents_by_severity.map((row) => (
                  <span key={row.severity}>
                    <Badge tone={severityTone(row.severity)}>{row.severity}</Badge>
                    <span className="numeric" style={{ color: 'var(--text)' }}>
                      {row.count}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="divider" />

          <div className="stack-sm">
            <span className="tiny subtle">Assigned to you</span>
            <div className="spread small">
              <span className="muted">Open tasks</span>
              <span className="numeric" style={{ color: 'var(--text)' }}>
                {data.mine.open_tasks}
              </span>
            </div>
            <div className="spread small">
              <span className="muted">Upcoming shifts</span>
              <span className="numeric" style={{ color: 'var(--text)' }}>
                {data.mine.upcoming_shifts}
              </span>
            </div>
            <div className="spread small">
              <span className="muted">Hours logged</span>
              <span className="numeric" style={{ color: 'var(--text)' }}>
                {data.mine.hours} h
              </span>
            </div>
          </div>
        </Panel>
      </Split>

      {/* ------------------------ schedule + incidents ------------------------- */}
      <Split>
        <Panel
          title="Operational schedule"
          subtitle="Next events and your roster"
          action={
            <Link className="btn btn-sm btn-ghost" to="/events">
              Calendar
            </Link>
          }
        >
          {data.upcoming_events.length === 0 && data.mine.shifts.length === 0 ? (
            <EmptyState
              icon="clock"
              title="Nothing scheduled"
              description="Events and assigned shifts will appear on this timeline."
            />
          ) : (
            <div className="timeline">
              {data.upcoming_events.slice(0, 3).map((event) => (
                <div className="timeline-item" key={`event-${event.id}`}>
                  <span className="timeline-time">{formatDate(event.starts_at, prefs).slice(0, 6)}</span>
                  <span className="timeline-mark" aria-hidden="true" />
                  <span className="timeline-body">
                    <span className="timeline-title">{event.name}</span>
                    <span className="timeline-sub">
                      {formatDateTime(event.starts_at, prefs)} · {event.venue_name ?? 'Venue TBC'} ·{' '}
                      {event.shift_count} shifts
                    </span>
                  </span>
                  <StatusBadge status={event.status} />
                </div>
              ))}
              {data.mine.shifts.slice(0, 3).map((shift) => (
                <div className="timeline-item" key={`shift-${shift.id}`}>
                  <span className="timeline-time">{formatDate(shift.starts_at, prefs).slice(0, 6)}</span>
                  <span className="timeline-mark" aria-hidden="true" />
                  <span className="timeline-body">
                    <span className="timeline-title">
                      {shift.title} <span className="subtle tiny">· you</span>
                    </span>
                    <span className="timeline-sub">
                      {shift.event_name} · {shift.venue_name ?? shift.location ?? 'TBC'} ·{' '}
                      {formatDateTime(shift.starts_at, prefs)}
                    </span>
                  </span>
                  <StatusBadge status={shift.assignment_status} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent incidents"
          subtitle="Latest reports from the floor"
          action={
            <Link className="btn btn-sm btn-ghost" to="/incidents">
              Incident log
            </Link>
          }
        >
          {data.recent_incidents.length === 0 ? (
            <EmptyState
              icon="shield"
              title="No incidents reported"
              description="Reports appear here with severity, owner and status."
            />
          ) : (
            <div className="list" style={{ marginBottom: 0 }}>
              {data.recent_incidents.map((incident) => (
                <div className="list-row" key={incident.id}>
                  <div className="list-main">
                    <span className="list-title">{incident.title}</span>
                    <span className="list-sub">
                      {incident.event_name ?? 'General'} · {relativeTime(incident.occurred_at, prefs)}
                      {incident.reporter_name ? ` · ${incident.reporter_name}` : ''}
                    </span>
                  </div>
                  <div className="list-end">
                    <Badge tone={severityTone(incident.severity)}>{incident.severity}</Badge>
                    <StatusBadge status={incident.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </Split>

      {/* ---------------------------- module access --------------------------- */}
      <Panel title="Go to module" subtitle="Direct operational entry points">
        <div className="module-grid">
          <ModuleTile to="/events" icon="calendar" label="Events" meta={`${totals.events_upcoming} upcoming`} />
          <ModuleTile to="/venues" icon="building" label="Venues" meta={`${totals.venues_active} active`} />
          <ModuleTile to="/volunteers" icon="users" label="Volunteers" meta={`${totals.volunteers} people`} />
          <ModuleTile to="/shifts" icon="clock" label="Shifts" meta={`${totals.shifts_upcoming} scheduled`} />
          <ModuleTile to="/attendance" icon="check-circle" label="Attendance" meta={`${attendance.rate}% rate`} />
          <ModuleTile to="/tasks" icon="clipboard" label="Tasks" meta={`${totals.open_tasks} open`} />
          <ModuleTile to="/incidents" icon="alert" label="Incidents" meta={`${totals.open_incidents} open`} />
          <ModuleTile to="/reports" icon="chart" label="Reports" meta="CSV exports" />
        </div>
      </Panel>
    </>
  );
}

function severityTone(severity: string): 'danger' | 'warning' | 'info' | 'neutral' {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  if (severity === 'low') return 'info';
  return 'neutral';
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}
