import type { DaySummary, NoteSummary } from '../lib/types';
import type { Op } from './opsOutbox';
import type { NoteChange } from './outbox';

const NOTE_PHOTO = /^\s*!\[[^\]]*\]\(\.\.\/Attachments\/([a-z0-9]{8,40}\.(?:jpg|png|webp|gif))\)\s*$/;

/** Server-shaped reminder (GET /api/reminders) with the optional fields an overlay may touch. */
type ApiReminder = Record<string, unknown> & { id: string; due: string; repeat?: string; done?: boolean };

const DAY = 86_400_000;
function advance(due: Date, repeat: string): Date {
  const d = new Date(due);
  if (repeat === 'daily') return new Date(d.getTime() + DAY);
  if (repeat === 'weekly') return new Date(d.getTime() + 7 * DAY);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + (repeat === 'monthly' ? 1 : 12));
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d;
}

/**
 * Applies queued (not yet sent) reminder ops to a reminder list, so the screens show what the
 * owner did offline. Safe to apply over data that already contains some of them.
 */
export function overlayReminders(list: ApiReminder[], ops: Op[], now = Date.now()): ApiReminder[] {
  let out = [...list];
  for (const op of ops) {
    switch (op.kind) {
      case 'reminder.create':
        if (!out.some((r) => r.id === op.data.id)) {
          const { extras, notes, ...rest } = op.data as Record<string, unknown>;
          out.push({ priority: 'medium', repeat: 'never', done: false, extras: extras ?? {}, notes: notes ?? '', createdAt: new Date(op.createdAt).toISOString(), ...rest, id: op.data.id, due: op.data.due, pendingSync: true });
        }
        break;
      case 'reminder.update':
        out = out.map((r) => {
          if (r.id !== op.reminderId) return r;
          const next: ApiReminder = { ...r, ...op.patch, pendingSync: true };
          if (op.patch.snoozedUntil === null) delete next.snoozedUntil;
          if (op.patch.done === true && !r.completedAt) next.completedAt = new Date(op.createdAt).toISOString();
          if (op.patch.done === false) delete next.completedAt;
          return next;
        });
        break;
      case 'reminder.complete':
        out = out.map((r) => {
          if (r.id !== op.reminderId) return r;
          const repeat = r.repeat ?? 'never';
          if (repeat === 'never') {
            const { snoozedUntil, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
            return { ...rest, done: true, completedAt: r.completedAt ?? new Date(op.createdAt).toISOString(), pendingSync: true };
          }
          if (new Date(r.due).getTime() > now) return r; // already moved on (applied before)
          let next = advance(new Date(r.due), repeat);
          while (next.getTime() <= now) next = advance(next, repeat);
          const { snoozedUntil, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
          return { ...rest, due: next.toISOString(), done: false, pendingSync: true };
        });
        break;
      case 'reminder.snooze':
        out = out.map((r) => (r.id === op.reminderId ? { ...r, snoozedUntil: op.until, pendingSync: true } : r));
        break;
      case 'reminder.delete':
        out = out.filter((r) => r.id !== op.reminderId);
        break;
      default:
        break;
    }
  }
  return out.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
}

/** Marks days with queued check-ins (mood and section counts) in a GET /api/daily range. */
export function overlayDays(days: DaySummary[], ops: Op[]): DaySummary[] {
  const appends = ops.filter((o): o is Extract<Op, { kind: 'daily.append' }> => o.kind === 'daily.append');
  const edited = new Set(ops.filter((o) => o.kind === 'daily.replace').map((o) => (o as Extract<Op, { kind: 'daily.replace' }>).date));
  if (!appends.length && !edited.size) return days;
  return days.map((d) => {
    const mine = appends.filter((o) => o.date === d.date);
    if (!mine.length && !edited.has(d.date)) return d;
    const next: DaySummary = { ...d, hasEntry: true, sections: { ...d.sections } };
    for (const o of ops.filter((x): x is Extract<Op, { kind: 'daily.replace' }> => x.kind === 'daily.replace' && x.date === d.date)) {
      const day = o.day;
      next.mood = day.mood;
      next.sections = { thoughts: day.thoughts.length, ideas: day.ideas.length, events: day.events.length };
      next.headline = (day.events[0] ?? day.thoughts[0] ?? day.ideas[0] ?? '').slice(0, 120);
      next.photos = [...day.photos];
      next.people = day.people.map((p) => p.name);
      next.places = day.places.map((p) => ({ ...p, label: p.label || 'Pinned location' }));
    }
    for (const o of mine) {
      if ('mood' in o.entry) {
        next.mood = o.entry.mood;
        if (o.entry.energy !== undefined) next.energy = o.entry.energy;
      } else if ('photo' in o.entry) {
        next.photos = [...(next.photos ?? []), o.entry.photo];
      } else if ('person' in o.entry) {
        next.people = [...(next.people ?? []), o.entry.person.name];
      } else if ('place' in o.entry) {
        next.places = [...(next.places ?? []), { label: o.entry.place.label || 'Pinned location', lat: o.entry.place.lat, lng: o.entry.place.lng }];
      } else {
        next.sections[o.entry.section] += 1;
        if (!next.headline) next.headline = o.entry.text.slice(0, 120);
      }
    }
    return next;
  });
}

export interface DayEntries {
  events: string[];
  thoughts: string[];
  ideas: string[];
  photos: string[];
  people: { name: string; phone?: string; email?: string }[];
  places: { lat: number; lng: number; label?: string }[];
}
interface DayDetail { date: string; exists: boolean; frontmatter?: Record<string, unknown>; hash?: string; entries?: DayEntries | null }

/** GET /api/daily/:date with a queued edit and check-ins for that day applied. */
export function overlayDayDetail(day: DayDetail, ops: Op[]): DayDetail {
  const replace = ops.filter((o): o is Extract<Op, { kind: 'daily.replace' }> => o.kind === 'daily.replace' && o.date === day.date).pop();
  const appends = ops.filter((o): o is Extract<Op, { kind: 'daily.append' }> => o.kind === 'daily.append' && o.date === day.date);
  if (!replace && !appends.length) return day;
  const base: DayEntries = { events: [], thoughts: [], ideas: [], photos: [], people: [], places: [], ...(day.entries ?? {}) };
  const entries: DayEntries = replace
    ? { events: replace.day.events, thoughts: replace.day.thoughts, ideas: replace.day.ideas, photos: replace.day.photos, people: replace.day.people, places: replace.day.places }
    : { ...base };
  const frontmatter = { ...(day.frontmatter ?? {}) };
  if (replace) {
    if (replace.day.mood === null) delete frontmatter.mood;
    else frontmatter.mood = replace.day.mood;
  }
  for (const o of appends.filter((a) => !replace || a.createdAt > replace.createdAt)) {
    const e = o.entry;
    if ('mood' in e) frontmatter.mood = e.mood;
    else if ('photo' in e) entries.photos = [...entries.photos, e.photo];
    else if ('person' in e) entries.people = [...entries.people, e.person];
    else if ('place' in e) entries.places = [...entries.places, e.place];
    else entries[e.section] = [...entries[e.section], e.text];
  }
  // Keep the hash of the server version: a queued edit of this day carries the same base.
  return { ...day, exists: true, frontmatter, entries };
}

/** GET /api/notes/read?path= with a queued edit of that note applied. */
export function overlayNoteRead(note: { path: string; title: string | null; body: string; hash: string }, queued: NoteChange[]) {
  const edit = queued.filter((c) => c.path === note.path).sort((a, b) => b.createdAt - a.createdAt)[0];
  return edit ? { ...note, title: edit.title, body: edit.body } : note;
}

const summarizeBody = (body: string) => {
  const lines = body.split(/\r?\n/);
  return {
    photos: lines.map((l) => NOTE_PHOTO.exec(l)?.[1]).filter((f): f is string => Boolean(f)),
    snippet: lines.filter((l) => !NOTE_PHOTO.test(l)).join(' ').trim().slice(0, 200),
  };
};

/** Adds new notes still waiting in the note outbox to the top of GET /api/notes, and applies queued edits. */
export function overlayNotes(notes: NoteSummary[], queued: NoteChange[]): NoteSummary[] {
  const edits = new Map(queued.filter((c) => c.path !== null).map((c) => [c.path as string, c]));
  if (edits.size) {
    notes = notes.map((n) => {
      const e = edits.get(n.path);
      return e ? { ...n, title: e.title, ...summarizeBody(e.body) } : n;
    });
  }
  const fresh = queued
    .filter((c) => c.path === null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map<NoteSummary>((c) => ({
      path: `pending:${c.id}`,
      title: c.title,
      tags: [],
      ...summarizeBody(c.body),
      updated: new Date(c.createdAt).toISOString(),
      hash: '',
      checklist: [],
    }));
  return fresh.length ? [...fresh, ...notes] : notes;
}
