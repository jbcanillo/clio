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
