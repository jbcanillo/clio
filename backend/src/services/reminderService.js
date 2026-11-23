import crypto from 'node:crypto';

const PRIORITIES = ['low', 'medium', 'high'];
const REPEATS = ['never', 'daily', 'weekly', 'monthly', 'yearly'];
const DIR = 'Clio/Reminders';
const ID_RE = /^[a-z0-9]+$/;

function codedError(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function parseIso(value, field) {
  const d = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(d.getTime())) throw new Error(`${field} must be an ISO date-time`);
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
    notes: f.body.trim(),
  });

  async function load(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw codedError('Reminder not found', 'not_found');
    const f = await vault.read(pathFor(id));
    if (!f || f.parseError) throw codedError('Reminder not found', 'not_found');
    return f;
  }

  async function save(f, patch) {
    const frontmatter = { ...f.frontmatter, ...patch };
    for (const [k, v] of Object.entries(frontmatter)) if (v === undefined) delete frontmatter[k];
    await vault.write(f.path, { frontmatter, body: f.body }, { expectedHash: f.hash });
    return toReminder({ ...f, frontmatter });
  }

  async function create(input) {
    if (typeof input?.title !== 'string' || input.title.trim() === '') throw new Error('title must not be empty');
    const due = parseIso(input.due, 'due');
    const priority = input.priority ?? 'medium';
    const repeat = input.repeat ?? 'never';
    if (!PRIORITIES.includes(priority)) throw new Error('priority must be low, medium or high');
    if (!REPEATS.includes(repeat)) throw new Error('repeat must be never, daily, weekly, monthly or yearly');
    const id = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    const frontmatter = { id, title: input.title.trim(), due: due.toISOString(), priority, repeat, done: false };
    await vault.write(pathFor(id), { frontmatter, body: input.notes ? `${input.notes}\n` : '' }, { expectedHash: null });
    return { id, title: frontmatter.title, due: frontmatter.due, priority, repeat, done: false, notes: (input.notes || '').trim() };
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
    if (repeat === 'never') return save(f, { done: true, snoozedUntil: undefined });
    let next = advance(new Date(f.frontmatter.due), repeat);
    while (next.getTime() <= now().getTime()) next = advance(next, repeat);
    return save(f, { due: next.toISOString(), done: false, snoozedUntil: undefined });
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

  return { create, list, complete, snooze, remove };
}
