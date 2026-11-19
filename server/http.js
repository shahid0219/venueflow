/** Small, dependency-free request validation + CSV helpers shared by all routes. */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new HttpError(403, message);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (message, details) => new HttpError(409, message, details);

const blank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

export function text(value, field, { required = false, max = 4000, min = 1, fallback = null } = {}) {
  if (blank(value)) {
    if (required) throw badRequest(`${field} is required`);
    return fallback;
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw badRequest(`${field} must be at least ${min} characters`);
  if (trimmed.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return trimmed;
}

export function integer(value, field, { required = false, min = 0, max = 1_000_000, fallback = 0 } = {}) {
  if (blank(value)) {
    if (required) throw badRequest(`${field} is required`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw badRequest(`${field} must be a whole number`);
  if (parsed < min) throw badRequest(`${field} must be at least ${min}`);
  if (parsed > max) throw badRequest(`${field} must be at most ${max}`);
  return parsed;
}

export function choice(value, field, allowed, { required = true, fallback = null } = {}) {
  if (blank(value)) {
    if (required) throw badRequest(`${field} is required`);
    return fallback;
  }
  if (!allowed.includes(value)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

export function email(value, field = 'Email', { required = true } = {}) {
  const raw = text(value, field, { required, max: 200 });
  if (raw === null) return null;
  const lowered = raw.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lowered)) throw badRequest(`${field} must be a valid email address`);
  return lowered;
}

/** Accepts ISO strings and <input type="datetime-local"> values (treated as UTC). */
export function isoDateTime(value, field, { required = false } = {}) {
  if (blank(value)) {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be an ISO date/time string`);
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value);
  const parsed = new Date(local ? `${value}Z` : value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`${field} must be a valid date/time`);
  return parsed.toISOString();
}

export function dateOrder(startsAt, endsAt, startField = 'Start', endField = 'End') {
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw badRequest(`${endField} must be after ${startField.toLowerCase()}`);
  }
}

export function idParam(req, name = 'id') {
  const parsed = Number(req.params[name]);
  if (!Number.isInteger(parsed) || parsed <= 0) throw badRequest('Invalid id');
  return parsed;
}

export function toCsv(columns, rows) {
  const esc = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => esc(c.value(row))).join(','));
  return [header, ...body].join('\r\n') + '\r\n';
}

export function csvResponse(res, filename, csvBody) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csvBody);
}

export function likeTerm(query) {
  return `%${String(query || '').replace(/[%_]/g, (m) => `\\${m}`)}%`;
}
