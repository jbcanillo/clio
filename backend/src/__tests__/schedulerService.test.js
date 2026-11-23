import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createScheduler } from '../services/schedulerService.js';

const D = '2026-11-23';
function setup({ tz = 'UTC', start = `${D}T08:00:00Z`, hasEntry = false, times = { morning: '09:00', evening: '20:30' }, dataDir } = {}) {
  dataDir = dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'clio-sched-'));
  const clock = { t: new Date(start) };
  const state = { hasEntry };
  const pushes = [];
  const push = { sendToAll: async (p) => { pushes.push(p); return { sent: 1, removed: 0 }; } };
  const daily = { hasEntry: async () => state.hasEntry };
  const settings = { getPublic: () => ({ timezone: tz, checkinTimes: times }) };
  const make = () => createScheduler({ settings, daily, push, dataDir, now: () => clock.t });
  return { sched: make(), make, clock, state, pushes, dataDir, at: (iso) => { clock.t = new Date(iso); } };
}

describe('scheduler.tick', () => {
  it('skips before the morning time, sends at it, and never sends the same slot twice', async () => {
    const s = setup({ start: `${D}T08:59:00Z` });
    expect(await s.sched.tick()).toBe('skipped');
    s.at(`${D}T09:00:00Z`);
    expect(await s.sched.tick()).toBe('sent');
    s.at(`${D}T09:01:00Z`);
    expect(await s.sched.tick()).toBe('skipped');
    expect(s.pushes).toHaveLength(1);
    expect(s.pushes[0].url).toBe('/?checkin=1');
  });
  it('skips when today already has an entry', async () => {
    const s = setup({ start: `${D}T10:00:00Z`, hasEntry: true });
    expect(await s.sched.tick()).toBe('skipped');
    expect(s.pushes).toHaveLength(0);
  });
  it('sends a second, evening nudge only if still empty', async () => {
    const s = setup({ start: `${D}T09:00:00Z` });
    await s.sched.tick();
    s.at(`${D}T20:30:00Z`);
    expect(await s.sched.tick()).toBe('sent');
    expect(s.pushes).toHaveLength(2);
    expect(s.pushes[1].title).not.toBe(s.pushes[0].title);
  });
  it('sends one nudge, not two, when both slots are overdue (server was down)', async () => {
    const s = setup({ start: `${D}T21:00:00Z` });
    expect(await s.sched.tick()).toBe('sent');
    expect(await s.sched.tick()).toBe('skipped');
    expect(s.pushes).toHaveLength(1);
  });
  it('starts fresh the next day', async () => {
    const s = setup({ start: `${D}T09:00:00Z` });
    await s.sched.tick();
    s.at('2026-11-24T09:00:00Z');
    expect(await s.sched.tick()).toBe('sent');
  });
  it('snoozeToday suppresses both slots that day only', async () => {
    const s = setup({ start: `${D}T08:00:00Z` });
    await s.sched.snoozeToday();
    s.at(`${D}T09:30:00Z`);
    expect(await s.sched.tick()).toBe('skipped');
    s.at(`${D}T21:00:00Z`);
    expect(await s.sched.tick()).toBe('skipped');
    s.at('2026-11-24T09:00:00Z');
    expect(await s.sched.tick()).toBe('sent');
  });
  it('uses the owner timezone: 01:00Z is 09:00 in Manila', async () => {
    const s = setup({ tz: 'Asia/Manila', start: `${D}T00:59:00Z` });
    expect(await s.sched.tick()).toBe('skipped');
    s.at(`${D}T01:00:00Z`);
    expect(await s.sched.tick()).toBe('sent');
  });
  it('follows local time across a DST change (New York, 2026-03-08)', async () => {
    const s = setup({ tz: 'America/New_York', start: '2026-03-07T13:59:00Z' }); // 08:59 EST
    expect(await s.sched.tick()).toBe('skipped');
    s.at('2026-03-07T14:00:00Z'); // 09:00 EST
    expect(await s.sched.tick()).toBe('sent');
    s.at('2026-03-08T12:59:00Z'); // 08:59 EDT
    expect(await s.sched.tick()).toBe('skipped');
    s.at('2026-03-08T13:00:00Z'); // 09:00 EDT
    expect(await s.sched.tick()).toBe('sent');
  });
  it('remembers what it sent across a restart', async () => {
    const s = setup({ start: `${D}T09:00:00Z` });
    await s.sched.tick();
    const restarted = s.make();
    s.at(`${D}T09:30:00Z`);
    expect(await restarted.tick()).toBe('skipped');
  });
  it('does not mark the slot as sent when nobody received the push, so a later subscriber still gets it', async () => {
    const s = setup({ start: `${D}T09:00:00Z` });
    let delivered = 0;
    const push = { sendToAll: async () => ({ sent: delivered, removed: 0 }) };
    const sched = createScheduler({ settings: { getPublic: () => ({ timezone: 'UTC', checkinTimes: { morning: '09:00', evening: '20:30' } }) }, daily: { hasEntry: async () => false }, push, dataDir: s.dataDir, now: () => s.clock.t });
    expect(await sched.tick()).toBe('skipped');
    delivered = 1;
    expect(await sched.tick()).toBe('sent');
  });
});

describe('scheduler.tickReminders', () => {
  function remSetup(list, start = '2026-12-01T09:00:00Z') {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-rem-'));
    const clock = { t: new Date(start) };
    const pushes = [];
    let delivered = 1;
    const push = { sendToAll: async (p) => { pushes.push(p); return { sent: delivered, removed: 0 }; } };
    const reminders = { list: async ({ done } = {}) => list.filter((r) => done === undefined || r.done === done) };
    const settings = { getPublic: () => ({ timezone: 'UTC', checkinTimes: { morning: '09:00', evening: '20:30' } }) };
    const make = () => createScheduler({ settings, daily: { hasEntry: async () => true }, push, reminders, dataDir, now: () => clock.t });
    return { make, sched: make(), clock, pushes, list, setDelivered: (n) => { delivered = n; } };
  }
  const rem = (over = {}) => ({ id: 'r1', title: 'Dentist', due: '2026-12-01T09:00:00.000Z', priority: 'high', repeat: 'never', done: false, notes: '', extras: {}, ...over });

  it('notifies once when a reminder becomes due, and never twice for the same due time', async () => {
    const s = remSetup([rem({ due: '2026-12-01T09:30:00.000Z' })]);
    expect(await s.sched.tickReminders()).toBe(0);
    s.clock.t = new Date('2026-12-01T09:30:00Z');
    expect(await s.sched.tickReminders()).toBe(1);
    s.clock.t = new Date('2026-12-01T09:31:00Z');
    expect(await s.sched.tickReminders()).toBe(0);
    expect(s.pushes).toEqual([expect.objectContaining({ title: 'Dentist', url: '/#/list' })]);
  });
  it('ignores done reminders and respects a snooze until its time', async () => {
    const s = remSetup([rem({ id: 'a', done: true }), rem({ id: 'b', snoozedUntil: '2026-12-01T10:00:00.000Z' })]);
    expect(await s.sched.tickReminders()).toBe(0);
    s.clock.t = new Date('2026-12-01T10:00:00Z');
    expect(await s.sched.tickReminders()).toBe(1);
  });
  it('a repeating reminder notifies again after it moved to its next due time', async () => {
    const s = remSetup([rem({ repeat: 'daily' })]);
    expect(await s.sched.tickReminders()).toBe(1);
    s.list[0] = rem({ repeat: 'daily', due: '2026-12-02T09:00:00.000Z' });
    s.clock.t = new Date('2026-12-02T09:00:00Z');
    expect(await s.sched.tickReminders()).toBe(1);
  });
  it('does not mark a reminder as notified when nobody received the push', async () => {
    const s = remSetup([rem()]);
    s.setDelivered(0);
    expect(await s.sched.tickReminders()).toBe(0);
    s.setDelivered(1);
    expect(await s.sched.tickReminders()).toBe(1);
  });
  it('remembers notified reminders across a restart', async () => {
    const s = remSetup([rem()]);
    await s.sched.tickReminders();
    expect(await s.make().tickReminders()).toBe(0);
  });
  it('does not announce a reminder that was already long overdue when the app first saw it (older than 24 h)', async () => {
    const s = remSetup([rem({ due: '2026-11-20T09:00:00.000Z' })]);
    expect(await s.sched.tickReminders()).toBe(0);
  });
});
