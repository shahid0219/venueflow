import { db, nowIso } from './db.js';
import { hashPassword } from './auth.js';

/** Shared demo password for the seeded accounts (documented in the README). */
export const DEMO_PASSWORD = 'Demo1234!';

const dayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const at = (dayOffset, hour, minute = 0) => {
  const d = new Date(dayStart().getTime() + dayOffset * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
};

const users = [
  {
    name: 'Avery Chen',
    email: 'admin@venueflow.app',
    role: 'admin',
    phone: '+44 7700 900101',
    city: 'Manchester',
    skills: 'Operations, Compliance, Budgeting',
    availability: 'Full time',
    bio: 'Head of operations. Oversees every VenueFlow site and the coordinator rota.',
  },
  {
    name: 'Priya Raman',
    email: 'organizer@venueflow.app',
    role: 'organizer',
    phone: '+44 7700 900102',
    city: 'Leeds',
    skills: 'Event design, Programming, Partner liaison',
    availability: 'Full time',
    bio: 'Programme lead for festivals and conferences across the northern venues.',
  },
  {
    name: 'Marcus Bell',
    email: 'coordinator@venueflow.app',
    role: 'coordinator',
    phone: '+44 7700 900103',
    city: 'Sheffield',
    skills: 'Volunteer management, Scheduling, Briefings',
    availability: 'Weekdays, event weekends',
    bio: 'Coordinates volunteer briefings, shift handovers and on-site incident response.',
  },
  {
    name: 'Sofia Alvarez',
    email: 'sofia@venueflow.app',
    role: 'volunteer',
    phone: '+44 7700 900104',
    city: 'Manchester',
    skills: 'Registration, Ushering, Customer care',
    availability: 'Weekday evenings, weekends',
    bio: 'Front-of-house volunteer, usually on accreditation and guest welcome.',
  },
  {
    name: 'Daniel Okafor',
    email: 'daniel@venueflow.app',
    role: 'volunteer',
    phone: '+44 7700 900105',
    city: 'Leeds',
    skills: 'AV, Stage crew, Rigging',
    availability: 'Event weekends',
    bio: 'Stage and AV volunteer. Runs sound checks with the production team.',
  },
  {
    name: 'Hana Sato',
    email: 'hana@venueflow.app',
    role: 'volunteer',
    phone: '+44 7700 900106',
    city: 'Sheffield',
    skills: 'First aid, Accessibility support',
    availability: 'Weekends',
    bio: 'Qualified first aider and accessibility marshal.',
  },
  {
    name: 'Liam Byrne',
    email: 'liam@venueflow.app',
    role: 'volunteer',
    phone: '+44 7700 900107',
    city: 'Liverpool',
    skills: 'Security, Crowd management',
    availability: 'Flexible',
    bio: 'Stewarding lead for large-capacity arena events.',
  },
  {
    name: 'Noor Haddad',
    email: 'noor@venueflow.app',
    role: 'volunteer',
    phone: '+44 7700 900108',
    city: 'Manchester',
    skills: 'Hospitality, Bar service, Stock',
    availability: 'Weekday evenings',
    bio: 'Hospitality volunteer covering green rooms and artist catering.',
  },
  {
    name: 'Tom Whitfield',
    email: 'tom@venueflow.app',
    role: 'volunteer',
    phone: '+44 7700 900109',
    city: 'Leeds',
    skills: 'Setup, Logistics, Van driving',
    availability: 'Weekdays',
    bio: 'Build and break crew. Handles equipment movement between venues.',
  },
  {
    name: 'Elena Petrova',
    email: 'elena@venueflow.app',
    role: 'volunteer',
    phone: '+44 7700 900110',
    city: 'Sheffield',
    skills: 'Photography, Social media',
    availability: 'Weekends',
    bio: 'Documents events for the marketing archive and social channels.',
  },
];

const venues = [
  {
    name: 'Riverside Convention Centre',
    address: '1200 Harbour Way',
    city: 'Manchester',
    capacity: 2400,
    contact_name: 'Dana Whitmore',
    contact_email: 'dana@riversidecc.co.uk',
    contact_phone: '+44 161 555 0142',
    status: 'active',
    notes: 'Two halls, load-in from 06:00. Accessible stage lift on the north side.',
  },
  {
    name: 'The Old Foundry',
    address: '8 Kiln Street',
    city: 'Leeds',
    capacity: 850,
    contact_name: 'Ruth Adeyemi',
    contact_email: 'ruth@oldfoundry.co.uk',
    contact_phone: '+44 113 555 0188',
    status: 'active',
    notes: 'Heritage venue, no vehicle access after 22:00.',
  },
  {
    name: 'Northgate Arena',
    address: 'Northgate Road',
    city: 'Sheffield',
    capacity: 5200,
    contact_name: 'Callum Reid',
    contact_email: 'callum@northgatearena.co.uk',
    contact_phone: '+44 114 555 0110',
    status: 'active',
    notes: 'Arena bowl with 6 turnstile blocks. Stewarding plan required 14 days ahead.',
  },
  {
    name: 'Harbourlight Pavilion',
    address: '4 Quay Parade',
    city: 'Liverpool',
    capacity: 320,
    contact_name: 'Jess Molyneux',
    contact_email: 'jess@harbourlight.co.uk',
    contact_phone: '+44 151 555 0175',
    status: 'maintenance',
    notes: 'Roof repairs until next month; bookings on hold.',
  },
];

const events = [
  {
    name: 'Northern Sound Festival',
    description: 'Two-day independent music festival across two halls with 14 acts.',
    venue: 0,
    organiser: 1,
    category: 'Music',
    status: 'completed',
    start: at(-18, 11),
    end: at(-17, 23),
    expected: 1850,
    shifts: [
      { title: 'Gates & accreditation', role: 'registration', day: -18, from: 9, to: 15, capacity: 3, assignees: [3, 6, 8] },
      { title: 'Hall A steward team', role: 'security', day: -18, from: 14, to: 22, capacity: 3, assignees: [6, 3, 9] },
      { title: 'Stage & AV support', role: 'av', day: -18, from: 10, to: 20, capacity: 2, assignees: [4, 7] },
      { title: 'First aid point', role: 'first_aid', day: -17, from: 12, to: 22, capacity: 2, assignees: [5, 3] },
    ],
  },
  {
    name: 'Foundry Tech Summit',
    description: 'Single-track conference for 600 delegates with four workshop rooms.',
    venue: 1,
    organiser: 1,
    category: 'Conference',
    status: 'completed',
    start: at(-6, 9),
    end: at(-6, 18),
    expected: 640,
    shifts: [
      { title: 'Delegate registration desk', role: 'registration', day: -6, from: 8, to: 13, capacity: 2, assignees: [3, 8] },
      { title: 'Workshop room support', role: 'general', day: -6, from: 9, to: 17, capacity: 2, assignees: [7, 9] },
      { title: 'AV and live stream', role: 'av', day: -6, from: 8, to: 18, capacity: 1, assignees: [4] },
    ],
  },
  {
    name: 'Winterlight Gala',
    description: 'Black-tie fundraising gala with a seated dinner for 900 guests.',
    venue: 0,
    organiser: 0,
    category: 'Gala',
    status: 'published',
    start: at(5, 18),
    end: at(5, 23),
    expected: 900,
    shifts: [
      { title: 'Guest welcome & cloakroom', role: 'hospitality', day: 5, from: 17, to: 22, capacity: 3, assignees: [7, 3] },
      { title: 'Table service support', role: 'hospitality', day: 5, from: 17, to: 23, capacity: 3, assignees: [8] },
      { title: 'Security & door team', role: 'security', day: 5, from: 16, to: 23, capacity: 2, assignees: [6] },
    ],
  },
  {
    name: 'Community Volunteer Fair',
    description: 'Recruitment fair for local charities with 40 stands.',
    venue: 1,
    organiser: 2,
    category: 'Community',
    status: 'published',
    start: at(11, 10),
    end: at(11, 16),
    expected: 260,
    shifts: [
      { title: 'Stand setup crew', role: 'logistics', day: 11, from: 8, to: 11, capacity: 3, assignees: [8, 9] },
      { title: 'Welcome desk', role: 'registration', day: 11, from: 9, to: 16, capacity: 2, assignees: [3] },
      { title: 'Photography & social', role: 'media', day: 11, from: 10, to: 16, capacity: 1, assignees: [9] },
    ],
  },
  {
    name: 'Arena Charity Match',
    description: 'Celebrity football match raising funds for regional youth sport.',
    venue: 2,
    organiser: 0,
    category: 'Sport',
    status: 'published',
    start: at(18, 14),
    end: at(18, 21),
    expected: 4100,
    shifts: [
      { title: 'Turnstile stewards', role: 'security', day: 18, from: 12, to: 18, capacity: 4, assignees: [6, 3] },
      { title: 'Pitch-side first aid', role: 'first_aid', day: 18, from: 13, to: 21, capacity: 2, assignees: [5] },
      { title: 'Hospitality boxes', role: 'hospitality', day: 18, from: 13, to: 21, capacity: 2, assignees: [7] },
    ],
  },
  {
    name: 'Spring Makers Market',
    description: 'Weekend craft market with 60 independent makers.',
    venue: 1,
    organiser: 2,
    category: 'Market',
    status: 'draft',
    start: at(32, 9),
    end: at(32, 17),
    expected: 480,
    shifts: [
      { title: 'Market build crew', role: 'logistics', day: 32, from: 7, to: 10, capacity: 3, assignees: [] },
      { title: 'Floor support', role: 'general', day: 32, from: 9, to: 17, capacity: 3, assignees: [] },
    ],
  },
];

const tasks = [
  { event: 2, title: 'Confirm final gala seating plan', assignee: 7, priority: 'high', status: 'in_progress', due: 2, description: 'Reconcile the caterer seating chart with the accessibility requests.' },
  { event: 2, title: 'Brief door team on guest list checks', assignee: 6, priority: 'medium', status: 'todo', due: 4, description: 'Walk through ID and ticket matching with the security lead.' },
  { event: 2, title: 'Order cloakroom ticket rolls', assignee: 8, priority: 'low', status: 'done', due: -1, completed: -1, description: 'Two boxes of 1000 numbered tickets.' },
  { event: 3, title: 'Publish volunteer briefing pack', assignee: 2, priority: 'high', status: 'todo', due: 6, description: 'Share the pack with all 24 registered stands and volunteers.' },
  { event: 3, title: 'Collect stand risk assessments', assignee: 2, priority: 'urgent', status: 'blocked', due: -2, description: 'Waiting on six charities to return signed forms.' },
  { event: 4, title: 'Submit stewarding plan to the arena', assignee: 0, priority: 'urgent', status: 'in_progress', due: 1, description: 'Arena requires the plan 14 days before the match.' },
  { event: 4, title: 'Book medical cover for pitch side', assignee: 5, priority: 'high', status: 'todo', due: 8, description: 'Two first aiders plus a response vehicle.' },
  { event: 4, title: 'Print 4000 match programmes', assignee: 1, priority: 'medium', status: 'todo', due: 12, description: 'Approve final artwork before printing.' },
  { event: 5, title: 'Recruit makers for spring market', assignee: 1, priority: 'medium', status: 'in_progress', due: 20, description: 'Target 60 confirmed makers with a waiting list.' },
  { event: 5, title: 'Draft market layout plan', assignee: 8, priority: 'low', status: 'todo', due: 26, description: 'Include fire lanes and accessible routes.' },
  { event: 0, title: 'Archive festival attendance records', assignee: 2, priority: 'low', status: 'done', due: -12, completed: -11, description: 'Export attendance and file it in the operations archive.' },
  { event: 1, title: 'Send delegate feedback survey', assignee: 1, priority: 'medium', status: 'done', due: -3, completed: -4, description: 'Survey sent to all 612 delegates who checked in.' },
];

const incidents = [
  { event: 0, title: 'Barrier pushed over at Hall A entrance', description: 'Crowd surge knocked two barriers over before doors; no injuries reported.', severity: 'high', status: 'resolved', reporter: 6, occurred: -18, resolution: 'Reinforced barrier line and added two stewards to the entrance.' },
  { event: 0, title: 'Lost child at the merchandise stand', description: 'Child separated from a guardian for 12 minutes during the headline set.', severity: 'critical', status: 'resolved', reporter: 5, occurred: -17, resolution: 'Reunited with guardian; welfare room used and incident logged with the venue.' },
  { event: 1, title: 'Projector failure in workshop room 2', description: 'Second projector failed during the 14:00 workshop.', severity: 'medium', status: 'resolved', reporter: 4, occurred: -6, resolution: 'Swapped to spare unit within 9 minutes.' },
  { event: 2, title: 'Accessible entrance blocked by deliveries', description: 'Catering pallets left across the accessible ramp before the gala.', severity: 'high', status: 'investigating', reporter: 3, occurred: 0, resolution: null },
  { event: 4, title: 'Turnstile 3 scanner offline', description: 'Scanner at turnstile 3 failing intermittently during setup checks.', severity: 'medium', status: 'open', reporter: 6, occurred: 1, resolution: null },
  { event: 3, title: 'Missing risk assessment for stand 18', description: 'Charity stand has not returned a signed risk assessment.', severity: 'low', status: 'open', reporter: 2, occurred: 2, resolution: null },
];

export function seedDemoData({ force = false } = {}) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existing > 0 && !force) return { seeded: false, reason: 'database already contains data' };

  const now = nowIso();
  const passwordHash = hashPassword(DEMO_PASSWORD);

  const run = db.transaction(() => {
    if (force) {
      db.exec(`DELETE FROM attendance; DELETE FROM shift_assignments; DELETE FROM shifts;
        DELETE FROM tasks; DELETE FROM incidents; DELETE FROM events; DELETE FROM venues;
        DELETE FROM sessions; DELETE FROM users;`);
    }

    const insertUser = db.prepare(
      `INSERT INTO users (name, email, password_hash, role, phone, city, skills, availability, bio, status, created_at)
       VALUES (@name, @email, @password_hash, @role, @phone, @city, @skills, @availability, @bio, 'active', @created_at)`,
    );
    const userIds = users.map(
      (user) => insertUser.run({ ...user, password_hash: passwordHash, created_at: now }).lastInsertRowid,
    );

    const insertVenue = db.prepare(
      `INSERT INTO venues (name, address, city, capacity, contact_name, contact_email, contact_phone, status, notes, created_at)
       VALUES (@name, @address, @city, @capacity, @contact_name, @contact_email, @contact_phone, @status, @notes, @created_at)`,
    );
    const venueIds = venues.map((venue) => insertVenue.run({ ...venue, created_at: now }).lastInsertRowid);

    const insertEvent = db.prepare(
      `INSERT INTO events (name, description, venue_id, organiser_id, category, starts_at, ends_at, status, expected_attendees, created_at)
       VALUES (@name, @description, @venue_id, @organiser_id, @category, @starts_at, @ends_at, @status, @expected_attendees, @created_at)`,
    );
    const insertShift = db.prepare(
      `INSERT INTO shifts (event_id, title, role, starts_at, ends_at, capacity, location, notes, created_at)
       VALUES (@event_id, @title, @role, @starts_at, @ends_at, @capacity, @location, @notes, @created_at)`,
    );
    const insertAssignment = db.prepare(
      `INSERT INTO shift_assignments (shift_id, user_id, status, created_at) VALUES (@shift_id, @user_id, @status, @created_at)`,
    );
    const insertAttendance = db.prepare(
      `INSERT INTO attendance (shift_id, user_id, status, checked_in_at, checked_out_at, recorded_by, notes, created_at)
       VALUES (@shift_id, @user_id, @status, @checked_in_at, @checked_out_at, @recorded_by, @notes, @created_at)`,
    );

    const eventIds = [];
    events.forEach((event) => {
      const eventId = insertEvent.run({
        name: event.name,
        description: event.description,
        venue_id: venueIds[event.venue],
        organiser_id: userIds[event.organiser],
        category: event.category,
        starts_at: event.start,
        ends_at: event.end,
        status: event.status,
        expected_attendees: event.expected,
        created_at: now,
      }).lastInsertRowid;
      eventIds.push(eventId);

      const past = new Date(event.end).getTime() < Date.now();
      event.shifts.forEach((shift) => {
        const shiftId = insertShift.run({
          event_id: eventId,
          title: shift.title,
          role: shift.role,
          starts_at: at(shift.day, shift.from),
          ends_at: at(shift.day, shift.to),
          capacity: shift.capacity,
          location: venues[event.venue].name,
          notes: null,
          created_at: now,
        }).lastInsertRowid;

        shift.assignees.forEach((index, position) => {
          const userId = userIds[index];
          insertAssignment.run({ shift_id: shiftId, user_id: userId, status: past ? 'completed' : position === 0 ? 'confirmed' : 'assigned', created_at: now });
          if (!past) return;

          const late = position === 2 && shift.capacity >= 3;
          const absent = position === 3 && shift.capacity >= 4;
          const start = at(shift.day, shift.from);
          const end = at(shift.day, shift.to);
          insertAttendance.run({
            shift_id: shiftId,
            user_id: userId,
            status: absent ? 'absent' : late ? 'late' : 'present',
            checked_in_at: absent ? null : late ? new Date(new Date(start).getTime() + 18 * 60_000).toISOString() : start,
            checked_out_at: absent ? null : end,
            recorded_by: userIds[2],
            notes: absent ? 'No show, coordinator attempted contact.' : late ? 'Arrived 18 minutes late, briefing missed.' : null,
            created_at: now,
          });
        });
      });
    });

    const insertTask = db.prepare(
      `INSERT INTO tasks (event_id, title, description, assignee_id, created_by, priority, status, due_at, completed_at, created_at)
       VALUES (@event_id, @title, @description, @assignee_id, @created_by, @priority, @status, @due_at, @completed_at, @created_at)`,
    );
    tasks.forEach((task) => {
      insertTask.run({
        event_id: eventIds[task.event],
        title: task.title,
        description: task.description,
        assignee_id: userIds[task.assignee],
        created_by: userIds[0],
        priority: task.priority,
        status: task.status,
        due_at: at(task.due, 17),
        completed_at: task.completed === undefined ? null : at(task.completed, 12),
        created_at: now,
      });
    });

    const insertIncident = db.prepare(
      `INSERT INTO incidents (event_id, title, description, severity, status, reported_by, occurred_at, resolution, resolved_at, created_at)
       VALUES (@event_id, @title, @description, @severity, @status, @reported_by, @occurred_at, @resolution, @resolved_at, @created_at)`,
    );
    incidents.forEach((incident) => {
      const occurredAt = at(incident.occurred, 14, 30);
      insertIncident.run({
        event_id: eventIds[incident.event],
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        status: incident.status,
        reported_by: userIds[incident.reporter],
        occurred_at: occurredAt,
        resolution: incident.resolution,
        resolved_at: incident.status === 'resolved' ? new Date(new Date(occurredAt).getTime() + 3 * 3_600_000).toISOString() : null,
        created_at: now,
      });
    });
  });

  run();

  return {
    seeded: true,
    users: users.length,
    venues: venues.length,
    events: events.length,
    password: DEMO_PASSWORD,
  };
}

const invokedDirectly = process.argv[1]?.endsWith('seed.js');
if (invokedDirectly) {
  const force = process.argv.includes('--force');
  const result = seedDemoData({ force });
  if (result.seeded) {
    console.log(`Seeded VenueFlow demo data: ${result.events} events, ${result.venues} venues, ${result.users} accounts.`);
    console.log(`Sign in with admin@venueflow.app / ${result.password}`);
  } else {
    console.log(`Skipped seeding: ${result.reason}. Use --force to reset the database.`);
  }
}
