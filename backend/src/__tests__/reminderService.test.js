import { makeVault } from './helpers/vault.js';
import { createReminderService } from '../services/reminderService.js';

let h, svc, now;
beforeEach(() => {
  h = makeVault();
  now = new Date('2026-01-01T10:00:00Z');
  svc = createReminderService({ vault: h.vault, now: () => now });
});
const base = { title: 'Dentist', due: '2026-01-01T09:00:00Z' };

describe('reminderService', () => {
  it('creates a reminder with defaults and lists it', async () => {
    const r = await svc.create(base);
    expect(r).toMatchObject({ title: 'Dentist', priority: 'medium', repeat: 'never', done: false, notes: '' });
    expect(r.id).toMatch(/^[a-z0-9]+$/);
    expect((await svc.list()).map((x) => x.id)).toEqual([r.id]);
  });
  it('validates title and due', async () => {
    await expect(svc.create({ ...base, title: '  ' })).rejects.toThrow(/title/);
    await expect(svc.create({ ...base, due: 'tomorrow-ish' })).rejects.toThrow(/due/);
    await expect(svc.create({ ...base, priority: 'urgent' })).rejects.toThrow(/priority/);
  });
  it('completing a one-off reminder marks it done', async () => {
    const r = await svc.create(base);
    expect((await svc.complete(r.id)).done).toBe(true);
  });
  it('completing a daily reminder advances due by one day and stays not done', async () => {
    const r = await svc.create({ ...base, repeat: 'daily' });
    const c = await svc.complete(r.id);
    expect(c.done).toBe(false);
    expect(c.due).toBe('2026-01-02T09:00:00.000Z');
  });
  it('an overdue repeating reminder advances to the next future occurrence', async () => {
    now = new Date('2026-01-05T10:00:00Z');
    const r = await svc.create({ ...base, repeat: 'daily' });
    expect((await svc.complete(r.id)).due).toBe('2026-01-06T09:00:00.000Z');
  });
  it('monthly repeat from the 31st clamps to the end of February', async () => {
    const r = await svc.create({ title: 'Rent', due: '2026-01-31T09:00:00Z', repeat: 'monthly' });
    expect((await svc.complete(r.id)).due).toBe('2026-02-28T09:00:00.000Z');
  });
  it('snooze sets snoozedUntil and rejects an invalid date', async () => {
    const r = await svc.create(base);
    expect((await svc.snooze(r.id, '2026-01-01T12:00:00Z')).snoozedUntil).toBe('2026-01-01T12:00:00.000Z');
    await expect(svc.snooze(r.id, 'nope')).rejects.toThrow(/until/);
  });
  it('list filters by done and by due range and sorts by due', async () => {
    const a = await svc.create({ title: 'B', due: '2026-01-03T09:00:00Z' });
    const b = await svc.create({ title: 'A', due: '2026-01-02T09:00:00Z' });
    await svc.complete(b.id);
    expect((await svc.list({ done: false })).map((r) => r.id)).toEqual([a.id]);
    expect((await svc.list({ from: '2026-01-03T00:00:00Z' })).map((r) => r.id)).toEqual([a.id]);
    expect((await svc.list()).map((r) => r.title)).toEqual(['A', 'B']);
  });
  it('remove deletes the reminder; unknown ids throw not_found', async () => {
    const r = await svc.create(base);
    await svc.remove(r.id);
    expect(await svc.list()).toEqual([]);
    await expect(svc.complete('nope')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('ignores a reminder file with broken frontmatter', async () => {
    h.writeRaw('Clio/Reminders/bad.md', '---\n: bad: [yaml\n---\n');
    await svc.create(base);
    expect(await svc.list()).toHaveLength(1);
  });
  it('rejects ids that look like paths', async () => {
    await expect(svc.complete('../Daily/2026-01-01')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('reminderService: update, extras, timestamps', () => {
  let h2, svc2, now2;
  beforeEach(() => { h2 = makeVault(); now2 = new Date('2026-01-01T10:00:00Z'); svc2 = createReminderService({ vault: h2.vault, now: () => now2 }); });
  const base2 = { title: 'Dentist', due: '2026-01-01T09:00:00Z' };

  it('keeps arbitrary extras and a created timestamp', async () => {
    const r = await svc2.create({ ...base2, extras: { checklist: [{ t: 'bring card', done: false }], contact: 'Dr. Ana' } });
    expect(r.extras).toEqual({ checklist: [{ t: 'bring card', done: false }], contact: 'Dr. Ana' });
    expect(r.createdAt).toBe('2026-01-01T10:00:00.000Z');
    expect((await svc2.list())[0].extras.contact).toBe('Dr. Ana');
  });
  it('rejects extras that are not an object or are too large', async () => {
    await expect(svc2.create({ ...base2, extras: 'x' })).rejects.toThrow(/extras/);
    await expect(svc2.create({ ...base2, extras: { big: 'x'.repeat(30000) } })).rejects.toThrow(/extras/);
  });
  it('completing a one-off sets completedAt; reopening via update clears it', async () => {
    const r = await svc2.create(base2);
    const done = await svc2.complete(r.id);
    expect(done).toMatchObject({ done: true, completedAt: '2026-01-01T10:00:00.000Z' });
    const reopened = await svc2.update(r.id, { done: false });
    expect(reopened.done).toBe(false);
    expect(reopened.completedAt).toBeUndefined();
  });
  it('update changes fields, notes and extras and validates them', async () => {
    const r = await svc2.create(base2);
    const u = await svc2.update(r.id, { title: 'Dentist (moved)', due: '2026-01-02T09:00:00Z', priority: 'high', notes: 'bring card', extras: { a: 1 }, snoozedUntil: '2026-01-01T12:00:00Z' });
    expect(u).toMatchObject({ title: 'Dentist (moved)', due: '2026-01-02T09:00:00.000Z', priority: 'high', notes: 'bring card', extras: { a: 1 }, snoozedUntil: '2026-01-01T12:00:00.000Z' });
    await expect(svc2.update(r.id, { title: ' ' })).rejects.toThrow(/title/);
    await expect(svc2.update(r.id, { priority: 'urgent' })).rejects.toThrow(/priority/);
    expect((await svc2.update(r.id, { snoozedUntil: null })).snoozedUntil).toBeUndefined();
    await expect(svc2.update('nope', { title: 'x' })).rejects.toMatchObject({ code: 'not_found' });
  });
});
