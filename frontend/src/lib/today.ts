/** 'YYYY-MM-DD' for now in the given IANA timezone (the owner's, not the browser's). */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Calendar arithmetic on a 'YYYY-MM-DD' key. */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Offset of `tz` from UTC at `at`, in minutes (positive east of UTC). */
function offsetMinutes(tz: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** 09:00 on the calendar day `day` ('YYYY-MM-DD') in `timezone`, as an ISO string with that day's offset. */
export function nineAmOn(timezone: string, day: string): string {
  // Offset in force at 09:00 local that day; refined once so DST-transition days resolve correctly.
  const guess = Date.parse(`${day}T09:00:00Z`);
  let off = offsetMinutes(timezone, new Date(guess));
  off = offsetMinutes(timezone, new Date(guess - off * 60000));
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${day}T09:00:00${sign}${hh}:${mm}`;
}

const localDay = (timezone: string, now: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** The next 09:00 in `timezone` as an ISO string with that day's offset: today if it is before 09:00 there, else tomorrow. */
export function nextNineAm(timezone: string, now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', hour: '2-digit' }).format(now));
  const local = localDay(timezone, now);
  return nineAmOn(timezone, hour < 9 ? local : addDays(local, 1));
}

/** 09:00 on the next calendar day in `timezone`, whatever the time is now (a "Tomorrow 9:00" snooze). */
export function tomorrowNineAm(timezone: string, now: Date = new Date()): string {
  return nineAmOn(timezone, addDays(localDay(timezone, now), 1));
}
