import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { todayKey } from './timeUtil.js';

const SLOTS = ['morning', 'evening'];
const MESSAGES = {
  morning: { title: 'Good morning ☀️', body: 'How are you feeling? Take a minute to write down your thoughts for today.' },
  evening: { title: 'Before you wind down 🌙', body: "You haven't written anything today yet. How was your day?" },
};

function localMinutes(now, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  return get('hour') * 60 + get('minute');
}
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Daily "write something" nudges: morning and (if still empty) evening, in the owner's timezone. */
export function createScheduler({ settings, daily, push, reminders, now = () => new Date(), dataDir, logger = console }) {
  const file = path.join(dataDir, 'checkin-state.json');
  fs.mkdirSync(dataDir, { recursive: true });
  let task = null;

  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return { sent: {}, snoozed: {}, notified: {} };
    }
  };
  const save = (state) => {
    // keep a week of history only
    for (const k of ['sent', 'snoozed']) {
      for (const d of Object.keys(state[k]).sort().slice(0, -7)) delete state[k][d];
    }
    const ids = Object.keys(state.notified ?? {});
    for (const id of ids.slice(0, Math.max(0, ids.length - 2000))) delete state.notified[id];
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  };

  async function tick() {
    const { timezone, checkinTimes } = settings.getPublic();
    const date = todayKey(now(), timezone);
    const state = load();
    state.notified ??= {};
    if (state.snoozed[date]) return 'skipped';

    const minutes = localMinutes(now(), timezone);
    const alreadySent = state.sent[date] || [];
    const due = SLOTS.filter((s) => minutes >= toMinutes(checkinTimes[s]) && !alreadySent.includes(s));
    if (due.length === 0) return 'skipped';
    if (await daily.hasEntry(date)) return 'skipped';

    const slot = due[due.length - 1]; // one nudge, using the latest overdue slot
    const { sent } = await push.sendToAll({ ...MESSAGES[slot], url: '/?checkin=1' });
    if (sent === 0) return 'skipped'; // nobody received it; try again next minute
    state.sent[date] = [...new Set([...alreadySent, ...due])];
    save(state);
    return 'sent';
  }

  const STALE_MS = 24 * 3600 * 1000;

  /** Pushes a notification for every reminder that has just become due. Returns how many were sent. */
  async function tickReminders() {
    if (!reminders) return 0;
    const state = load();
    state.notified ??= {};
    const nowMs = now().getTime();
    let count = 0;
    for (const r of await reminders.list({ done: false })) {
      const effective = r.snoozedUntil ?? r.due;
      const at = new Date(effective).getTime();
      const key = `${r.due}|${r.snoozedUntil ?? ''}`;
      if (at > nowMs || nowMs - at > STALE_MS || state.notified[r.id] === key) continue;
      const { sent } = await push.sendToAll({ title: r.title, body: r.notes ? r.notes.slice(0, 120) : 'Reminder is due', url: '/#/list' });
      if (sent === 0) continue;
      state.notified[r.id] = key;
      count += 1;
    }
    if (count) save(state);
    return count;
  }

  async function snoozeToday() {
    const state = load();
    state.snoozed[todayKey(now(), settings.getPublic().timezone)] = true;
    state.notified ??= {};
    save(state);
  }

  function start() {
    if (task) return;
    task = cron.schedule('* * * * *', () => {
      tick().catch((e) => logger.error?.(`check-in tick failed: ${e.message}`));
      tickReminders().catch((e) => logger.error?.(`reminder tick failed: ${e.message}`));
    });
  }
  function stop() {
    task?.stop();
    task = null;
  }

  return { tick, tickReminders, start, stop, snoozeToday };
}
