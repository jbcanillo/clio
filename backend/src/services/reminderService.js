import { ValidationError } from '../errors.js';
import crypto from 'node:crypto';

const PRIORITIES = ['low', 'medium', 'high'];
const REPEATS = ['never', 'daily', 'weekly', 'monthly', 'yearly'];
const DIR = 'Clio/Reminders';
const ID_RE = /^[a-z0-9]+$/;
const MAX_EXTRAS_CHARS = 20000;

function codedError(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function parseIso(value, field) {
  const d = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(d.getTime())) throw new ValidationError(`${field} must be an ISO date-time`);
  return d;
}

function addMonthsClamped(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function advance(date, repeat) {
  if (repeat === 'daily') return new Date(date.getTime() + 86400000);
  if (repeat === 'weekly') return new Date(date.getTime() + 7 * 86400000);
  if (repeat === 'monthly') return addMonthsClamped(date, 1);
  return addMonthsClamped(date, 12); // yearly
}

/** Reminders stored one-per-file in Clio/Reminders/<id>.md. */
export function createReminderService({ vault, now = () => new Date() }) {
  const pathFor = (id) => `${DIR}/${id}.md`;
  const toReminder = (f) => ({
    id: f.frontmatter.id,
    title: f.frontmatter.title,
    due: f.frontmatter.due,
    priority: f.frontmatter.priority,
    repeat: f.frontmatter.repeat,
    done: Boolean(f.frontmatter.done),
    ...(f.frontmatter.snoozedUntil ? { snoozedUntil: f.frontmatter.snoozedUntil } : {}),
    ...(f.frontmatter.completedAt ? { completedAt: f.frontmatter.completedAt } : {}),
    ...(f.frontmatter.created ? { createdAt: f.frontmatter.created } : {}),
    extras: f.frontmatter.extras ?? {},
    notes: f.body.trim(),
  });

  async function load(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw codedError('Reminder not found', 'not_found');
    const f = await vault.read(pathFor(id));
    if (!f || f.parseError) throw codedError('Reminder not found', 'not_found');
    return f;
  }

  async function save(f, patch, body = f.body) {
    const frontmatter = { ...f.frontmatter, ...patch };
    for (const [k, v] of Object.entries(frontmatter)) if (v === undefined || v === null) delete frontmatter[k];
    await vault.write(f.path, { frontmatter, body }, { expectedHash: f.hash });
    return toReminder({ ...f, frontmatter, body });
  }

  function checkExtras(extras) {
    if (extras === undefined) return;
    if (extras === null || typeof extras !== 'object' || Array.isArray(extras)) throw new ValidationError('extras must be an object');
    if (JSON.stringify(extras).length > MAX_EXTRAS_CHARS) throw new ValidationError('extras is too large');
  }
  function checkFields(input) {
    if (input.priority !== undefined && !PRIORITIES.includes(input.priority)) throw new ValidationError('priority must be low, medium or high');
    if (input.repeat !== undefined && !REPEATS.includes(input.repeat)) throw new ValidationError('repeat must be never, daily, weekly, monthly or yearly');
    checkExtras(input.extras);
  }

  async function create(input) {
    if (typeof input?.title !== 'string' || input.title.trim() === '') throw new ValidationError('title must not be empty');
    const due = parseIso(input.due, 'due');
    checkFields(input);
    const priority = input.priority ?? 'medium';
    const repeat = input.repeat ?? 'never';
    // A client-chosen id lets an offline create be retried without making a second reminder.
    if (input.id !== undefined && (typeof input.id !== 'string' || !ID_RE.test(input.id) || input.id.length < 8 || input.id.length > 40)) {
      throw new ValidationError('id must be 8-40 lowercase letters or digits');
    }
    const id = input.id ?? Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    // done / completedAt / createdAt are only honoured when set programmatically (the legacy import).
    const created = input.createdAt && !Number.isNaN(new Date(input.createdAt).getTime()) ? new Date(input.createdAt) : now();
    const frontmatter = { id, title: input.title.trim(), due: due.toISOString(), priority, repeat, done: Boolean(input.done), created: created.toISOString() };
    if (input.done && input.completedAt && !Number.isNaN(new Date(input.completedAt).getTime())) frontmatter.completedAt = new Date(input.completedAt).toISOString();
    if (input.extras && Object.keys(input.extras).length) frontmatter.extras = input.extras;
    await vault.write(pathFor(id), { frontmatter, body: input.notes ? `${input.notes}\n` : '' }, { expectedHash: null });
    return toReminder({ path: pathFor(id), frontmatter, body: input.notes ? `${input.notes}\n` : '' });
  }

  async function list({ from, to, done } = {}) {
    const files = await vault.list(DIR);
    const out = [];
    for (const p of files) {
      const f = await vault.read(p);
      if (!f || f.parseError || !f.frontmatter.id || !f.frontmatter.due) continue;
      const r = toReminder(f);
      const due = new Date(r.due).getTime();
      if (from && due < new Date(from).getTime()) continue;
      if (to && due > new Date(to).getTime()) continue;
      if (done !== undefined && r.done !== done) continue;
      out.push(r);
    }
    return out.sort((a, b) => new Date(a.due) - new Date(b.due));
  }

  async function complete(id) {
    const f = await load(id);
    const repeat = f.frontmatter.repeat || 'never';
    if (repeat === 'never') return save(f, { done: true, completedAt: now().toISOString(), snoozedUntil: undefined });
    let next = advance(new Date(f.frontmatter.due), repeat);
    while (next.getTime() <= now().getTime()) next = advance(next, repeat);
    return save(f, { due: next.toISOString(), done: false, snoozedUntil: undefined });
  }

  async function update(id, patch) {
    const f = await load(id);
    checkFields(patch);
    const changes = {};
    if (patch.title !== undefined) {
      if (typeof patch.title !== 'string' || patch.title.trim() === '') throw new ValidationError('title must not be empty');
      changes.title = patch.title.trim();
    }
    if (patch.due !== undefined) changes.due = parseIso(patch.due, 'due').toISOString();
    if (patch.priority !== undefined) changes.priority = patch.priority;
    if (patch.repeat !== undefined) changes.repeat = patch.repeat;
    if (patch.extras !== undefined) changes.extras = Object.keys(patch.extras).length ? patch.extras : undefined;
    if (patch.snoozedUntil !== undefined) changes.snoozedUntil = patch.snoozedUntil === null ? undefined : parseIso(patch.snoozedUntil, 'snoozedUntil').toISOString();
    if (patch.done !== undefined) {
      changes.done = Boolean(patch.done);
      changes.completedAt = patch.done ? f.frontmatter.completedAt ?? now().toISOString() : undefined;
    }
    const body = patch.notes !== undefined ? (patch.notes ? `${patch.notes}\n` : '') : f.body;
    return save(f, changes, body);
  }

  async function snooze(id, untilIso) {
    const until = parseIso(untilIso, 'until');
    const f = await load(id);
    return save(f, { snoozedUntil: until.toISOString() });
  }

  async function remove(id) {
    const f = await load(id);
    await vault.remove(f.path, { expectedHash: f.hash });
  }

  return { create, list, update, complete, snooze, remove };
}
