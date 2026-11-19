import { Link } from 'react-router-dom';
import { useFetch } from '../api';
import { useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { formatDateTime, relativeTime } from '../format';
import type { DashboardData } from '../types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Icon,
  LoadingBlock,
  PageHeader,
  Progress,
  StatCard,
  StatusBadge,
} from '../ui';

export default function Dashboard() {
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<DashboardData>('/api/dashboard');

  if (loading) return <LoadingBlock label="Loading operational dashboard…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const { totals, attendance } = data;
  const maxCheckIns = Math.max(1, ...data.activity.map((point) => point.check_ins));
  const tasksTotal = data.tasks_by_status.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={`Live operations snapshot · updated ${relativeTime(data.generated_at, prefs)}`}
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

      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <StatCard
          label="Upcoming events"
          value={totals.events_upcoming}
          hint={`${totals.events_live} live now · ${totals.events_total} total`}
          icon="calendar"
        />
        <StatCard
          label="Active venues"
          value={totals.venues_active}
          hint={`${totals.venues} venues in the register`}
          icon="building"
        />
        <StatCard
          label="Volunteers"
          value={totals.volunteers}
          hint={`${totals.staff} staff accounts · ${totals.members_active} active`}
          icon="users"
        />
        <StatCard
          label="Shift fill rate"
          value={`${totals.fill_rate}%`}
          hint={`${totals.slots_filled} of ${totals.slots_total} upcoming slots filled`}
          icon="clock"
          tone={totals.fill_rate >= 80 ? 'positive' : totals.fill_rate < 50 ? 'negative' : undefined}
        />
        <StatCard
          label="Open tasks"
          value={totals.open_tasks}
          hint={
            totals.overdue_tasks > 0 ? `${totals.overdue_tasks} overdue` : 'Nothing overdue'
          }
          tone={totals.overdue_tasks > 0 ? 'negative' : 'positive'}
          icon="clipboard"
        />
        <StatCard
          label="Open incidents"
          value={totals.open_incidents}
          hint={
            totals.urgent_incidents > 0
              ? `${totals.urgent_incidents} high or critical`
              : 'No urgent incidents'
          }
          tone={totals.urgent_incidents > 0 ? 'negative' : 'positive'}
          icon="alert"
        />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card
          title="Upcoming events"
          subtitle="Staffing and risk for the next events on the calendar"
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
              description="Create an event to start scheduling volunteers and tasks."
              action={
                <Link className="btn btn-sm btn-primary" to="/events">
                  Create event
                </Link>
              }
            />
          ) : (
            <div className="list">
              {data.upcoming_events.map((event) => {
                const fill = event.slots_total
                  ? Math.round((event.slots_filled / event.slots_total) * 100)
                  : 0;
                return (
                  <div className="list-row" key={event.id}>
                    <div className="list-main">
                      <span className="list-title">{event.name}</span>
                      <span className="list-sub">
                        {formatDateTime(event.starts_at, prefs)} · {event.venue_name ?? 'No venue'}
                      </span>
                    </div>
                    <div className="list-end">
                      {event.open_incidents > 0 ? (
                        <Badge tone="danger" dot>
                          {event.open_incidents} incident{event.open_incidents === 1 ? '' : 's'}
                        </Badge>
                      ) : null}
                      {event.open_tasks > 0 ? (
                        <Badge tone="warning">{event.open_tasks} tasks</Badge>
                      ) : null}
                      <Progress value={fill} />
                      <StatusBadge status={event.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title="Shifts needing volunteers"
          subtitle="Upcoming shifts below capacity"
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
            <div className="list">
              {data.shifts_at_risk.map((shift) => (
                <div className="list-row" key={shift.id}>
                  <div className="list-main">
                    <span className="list-title">{shift.title}</span>
                    <span className="list-sub">
                      {shift.event_name} · {formatDateTime(shift.starts_at, prefs)}
                    </span>
                  </div>
                  <div className="list-end">
                    <Badge tone="warning">
                      {shift.capacity - shift.assigned_count} open
                    </Badge>
                    <Progress
                      value={(shift.assigned_count / Math.max(1, shift.capacity)) * 100}
                      label={`${shift.assigned_count}/${shift.capacity}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card title="Attendance overview" subtitle={`${attendance.records} recorded check-ins`}>
          <div className="card-pad stack">
            <div className="grid grid-3" style={{ gap: 10 }}>
              <MiniStat label="Present" value={attendance.present} tone="var(--success)" />
              <MiniStat label="Late" value={attendance.late} tone="var(--warning)" />
              <MiniStat label="Absent" value={attendance.absent} tone="var(--danger)" />
            </div>
            <div className="spread">
              <span className="small muted">Attendance rate</span>
              <span className="small" style={{ fontWeight: 600 }}>
                {attendance.rate}%
              </span>
            </div>
            <Progress value={attendance.rate} />
            <div>
              <span className="tiny subtle">Check-ins, last 14 days</span>
              <div className="bar-chart" role="img" aria-label="Check-ins over the last 14 days">
                {data.activity.map((point) => (
                  <div className="bar-col" key={point.date} title={`${point.date}: ${point.check_ins}`}>
                    <div
                      className="bar"
                      style={{ height: `${Math.max(3, (point.check_ins / maxCheckIns) * 100)}%` }}
                    />
                    <span className="bar-label">{point.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="spread small">
              <span className="muted">Volunteer hours logged</span>
              <span style={{ fontWeight: 600 }}>{attendance.hours} h</span>
            </div>
          </div>
        </Card>

        <Card title="Tasks by status" subtitle={`${tasksTotal} tasks across all events`}>
          <div className="card-pad stack-sm">
            {data.tasks_by_status.length === 0 ? (
              <EmptyState icon="clipboard" title="No tasks yet" description="Tasks appear here once created." />
            ) : (
              data.tasks_by_status.map((row) => (
                <div className="spread" key={row.status}>
                  <StatusBadge status={row.status} />
                  <div className="row-tight" style={{ flex: 1, marginLeft: 12 }}>
                    <Progress
                      value={tasksTotal ? (row.count / tasksTotal) * 100 : 0}
                      label={`${row.count}`}
                    />
                  </div>
                </div>
              ))
            )}
            <div className="divider" />
            <div className="spread small">
              <span className="muted">Assigned to you</span>
              <span style={{ fontWeight: 600 }}>{data.mine.open_tasks} open</span>
            </div>
            <div className="spread small">
              <span className="muted">Your upcoming shifts</span>
              <span style={{ fontWeight: 600 }}>{data.mine.upcoming_shifts}</span>
            </div>
            <div className="spread small">
              <span className="muted">Your logged hours</span>
              <span style={{ fontWeight: 600 }}>{data.mine.hours} h</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card
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
              description="Incident reports will appear here with severity and status."
            />
          ) : (
            <div className="list">
              {data.recent_incidents.map((incident) => (
                <div className="list-row" key={incident.id}>
                  <div className="list-main">
                    <span className="list-title">{incident.title}</span>
                    <span className="list-sub">
                      {incident.event_name ?? 'General'} · {relativeTime(incident.occurred_at, prefs)}
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
        </Card>

        <Card title="Your next shifts" subtitle="Assignments on your roster">
          {data.mine.shifts.length === 0 ? (
            <EmptyState
              icon="clock"
              title="No shifts assigned"
              description="When a coordinator assigns you to a shift it will show up here."
            />
          ) : (
            <div className="list">
              {data.mine.shifts.map((shift) => (
                <div className="list-row" key={shift.id}>
                  <div className="list-main">
                    <span className="list-title">{shift.title}</span>
                    <span className="list-sub">
                      {shift.event_name} · {shift.venue_name ?? 'TBC'}
                    </span>
                  </div>
                  <div className="list-end">
                    <span className="small muted">{formatDateTime(shift.starts_at, prefs)}</span>
                    <StatusBadge status={shift.assignment_status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="stack-sm">
      <span className="tiny subtle">{label}</span>
      <span style={{ fontSize: 19, fontWeight: 650, color: tone }}>{value}</span>
    </div>
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
