export type DateFormat = 'dmy' | 'mdy' | 'iso';

export interface Prefs {
  timezone: string;
  dateFormat: DateFormat;
  theme: 'dark' | 'midnight' | 'daylight';
}

const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export const TIMEZONE_OPTIONS = TIMEZONES;
export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: 'dmy', label: '31 Dec 2026 (day first)' },
  { value: 'mdy', label: 'Dec 31, 2026 (month first)' },
  { value: 'iso', label: '2026-12-31 (ISO)' },
];
export const THEME_OPTIONS: { value: Prefs['theme']; label: string; description: string }[] = [
  { value: 'dark', label: 'VenueFlow Dark', description: 'Default deep navy workspace.' },
  { value: 'midnight', label: 'Midnight', description: 'Higher contrast, near-black surfaces.' },
  { value: 'daylight', label: 'Daylight', description: 'Light surfaces for bright rooms.' },
];

function safeZone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'UTC';
  }
}

export function formatDateTime(
  value: string | null | undefined,
  prefs: Prefs,
  options: { withTime?: boolean } = {},
): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const timeZone = safeZone(prefs.timezone);
  const withTime = options.withTime ?? true;

  const parts: Intl.DateTimeFormatOptions = withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
    : { day: '2-digit', month: 'short', year: 'numeric' };

  const formatted = new Intl.DateTimeFormat('en-GB', { ...parts, timeZone }).format(date);

  if (prefs.dateFormat === 'iso') {
    const iso = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    }).format(date);
    if (!withTime) return iso;
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date);
    return `${iso} ${time}`;
  }

  if (prefs.dateFormat === 'mdy') {
    const monthFirst = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
      timeZone,
    }).format(date);
    return monthFirst;
  }

  return formatted;
}

export function formatDate(value: string | null | undefined, prefs: Prefs): string {
  return formatDateTime(value, prefs, { withTime: false });
}

/** `datetime-local` value in UTC so the value round-trips without timezone drift. */
export function toInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

export function fromInputValue(value: string): string | null {
  if (!value) return null;
  return `${value}:00.000Z`;
}

export function relativeTime(value: string | null | undefined, prefs: Prefs): string {
  if (!value) return '—';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return '—';
  const diff = date - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60_000],
    ['hour', 3_600_000],
    ['day', 86_400_000],
    ['week', 604_800_000],
    ['month', 2_592_000_000],
  ];
  if (abs < 60_000) return 'just now';
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const [unit, ms] = units[index];
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return formatDateTime(value, prefs);
}
