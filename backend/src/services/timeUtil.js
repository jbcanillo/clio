/** 'YYYY-MM-DD' for the given instant in the given IANA timezone. */
export function todayKey(now, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Adds days to a 'YYYY-MM-DD' key (calendar arithmetic in UTC, DST-free). */
export function addDaysKey(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
