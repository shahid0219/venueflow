export type Role = 'admin' | 'organizer' | 'coordinator' | 'volunteer';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  city: string | null;
  skills: string | null;
  availability: string | null;
  bio: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface Venue {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  capacity: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: 'active' | 'maintenance' | 'inactive';
  notes: string | null;
  created_at: string;
  event_count?: number;
  upcoming_events?: number;
}

export interface EventRecord {
  id: number;
  name: string;
  description: string | null;
  venue_id: number | null;
  organiser_id: number | null;
  category: string | null;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'published' | 'live' | 'completed' | 'cancelled';
  expected_attendees: number;
  created_at: string;
  venue_name?: string | null;
  venue_city?: string | null;
  venue_capacity?: number | null;
  organiser_name?: string | null;
  shift_count?: number;
  slots_total?: number;
  slots_filled?: number;
  open_tasks?: number;
  open_incidents?: number;
}

export interface Volunteer extends User {
  assignment_count?: number;
  hours?: number;
  upcoming_shifts?: number;
  open_tasks?: number;
}

export interface Assignment {
  id: number;
  shift_id: number;
  user_id: number;
  status: 'assigned' | 'confirmed' | 'declined' | 'completed';
  name?: string;
  email?: string;
  role?: Role;
  created_at: string;
}

export interface Shift {
  id: number;
  event_id: number;
  title: string;
  role: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  location: string | null;
  notes: string | null;
  created_at: string;
  event_name: string;
  event_status: string;
  venue_name: string | null;
  assigned_count: number;
  confirmed_count: number;
  completed_count: number;
  assignments: Assignment[];
}

export interface AttendanceRecord {
  id: number;
  shift_id: number;
  user_id: number;
  status: 'present' | 'late' | 'absent';
  checked_in_at: string | null;
  checked_out_at: string | null;
  recorded_by: number | null;
  notes: string | null;
  created_at: string;
  user_name: string;
  user_email?: string;
  shift_title: string;
  event_id?: number;
  event_name: string;
  role?: string;
  hours: number;
}

export interface TaskRecord {
  id: number;
  event_id: number | null;
  title: string;
  description: string | null;
  assignee_id: number | null;
  created_by: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  event_name?: string | null;
  assignee_name?: string | null;
  creator_name?: string | null;
  overdue?: number;
}

export interface Incident {
  id: number;
  event_id: number | null;
  title: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved';
  reported_by: number | null;
  occurred_at: string;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  event_name?: string | null;
  reporter_name?: string | null;
}

export interface Conflict {
  shift_id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  event_id: number;
  event_name: string;
  colleagues: number;
}

export interface DashboardData {
  generated_at: string;
  totals: {
    events_total: number;
    events_upcoming: number;
    events_live: number;
    venues: number;
    venues_active: number;
    volunteers: number;
    staff: number;
    members_active: number;
    open_tasks: number;
    overdue_tasks: number;
    open_incidents: number;
    urgent_incidents: number;
    shifts_upcoming: number;
    shifts_understaffed: number;
    slots_total: number;
    slots_filled: number;
    fill_rate: number;
  };
  attendance: { records: number; present: number; late: number; absent: number; hours: number; rate: number };
  tasks_by_status: { status: string; count: number }[];
  incidents_by_severity: { severity: string; count: number }[];
  upcoming_events: {
    id: number;
    name: string;
    status: string;
    starts_at: string;
    ends_at: string;
    expected_attendees: number;
    category: string | null;
    venue_name: string | null;
    shift_count: number;
    slots_total: number;
    slots_filled: number;
    open_tasks: number;
    open_incidents: number;
  }[];
  shifts_at_risk: {
    id: number;
    title: string;
    role: string;
    starts_at: string;
    ends_at: string;
    capacity: number;
    event_id: number;
    event_name: string;
    venue_name: string | null;
    assigned_count: number;
  }[];
  recent_incidents: {
    id: number;
    title: string;
    severity: string;
    status: string;
    occurred_at: string;
    event_name: string | null;
    reporter_name: string | null;
  }[];
  activity: { date: string; check_ins: number }[];
  mine: {
    open_tasks: number;
    upcoming_shifts: number;
    hours: number;
    shifts: {
      id: number;
      title: string;
      role: string;
      starts_at: string;
      ends_at: string;
      location: string | null;
      assignment_status: string;
      event_id: number;
      event_name: string;
      venue_name: string | null;
    }[];
  };
}

export interface ReportDataset {
  id: string;
  label: string;
  description: string;
  row_count: number;
}
