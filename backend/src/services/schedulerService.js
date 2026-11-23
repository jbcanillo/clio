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
export function createScheduler({ settings, daily, push, now = () => new Date(), dataDir, logger = console }) {
  const file = path.join(dataDir, 'checkin-state.json');
  fs.mkdirSync(dataDir, { recursive: true });
  let task = null;

  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return { sent: {}, snoozed: {} };
    }
  };
  const save = (state) => {
    // keep a week of history only
    for (const k of ['sent', 'snoozed']) {
      for (const d of Object.keys(state[k]).sort().slice(0, -7)) delete state[k][d];
    }
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  };

  async function tick() {
    const { timezone, checkinTimes } = settings.getPublic();
    const date = todayKey(now(), timezone);
    const state = load();
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

  async function snoozeToday() {
    const state = load();
    state.snoozed[todayKey(now(), settings.getPublic().timezone)] = true;
    save(state);
  }

  function start() {
    if (task) return;
    task = cron.schedule('* * * * *', () => {
      tick().catch((e) => logger.error?.(`check-in tick failed: ${e.message}`));
    });
  }
  function stop() {
    task?.stop();
    task = null;
  }

  return { tick, start, stop, snoozeToday };
}
