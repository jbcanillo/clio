// Reminders and journal entries live in the vault, behind the Clio API.
// This module keeps the function names and object shapes of the old IndexedDB
// layer so the existing hooks and components work unchanged.
import { apiFetch } from '../lib/api';
import { emitDataChanged } from '../lib/dataEvents';
import { newReminderId, writeOrQueue } from '../offline/instances';

// Every successful write announces itself on the data-change bus so the
// always-mounted tabs refetch (callers can't forget to).
const changed = (kind) => (value) => { emitDataChanged(kind); return value; };
const reminderChanged = changed('reminders');
const dailyChanged = changed('daily');

const REMINDER_KNOWN = new Set(['id', 'title', 'description', 'dueDate', 'priority', 'repeat', 'completed', 'completed_at', 'created_at', 'snoozedUntil']);
const JOURNAL_KNOWN = new Set(['id', 'text', 'mood', 'createdAt']);

const pick = (obj, known) => Object.fromEntries(Object.entries(obj).filter(([k]) => !known.has(k)));
const iso = (v) => new Date(v).toISOString();

export function reminderFromApi(r) {
  return {
    ...(r.extras || {}),
    id: r.id,
    title: r.title,
    description: r.notes,
    dueDate: r.due,
    priority: r.priority,
    repeat: r.repeat,
    completed: r.done,
    completed_at: r.completedAt ?? null,
    created_at: r.createdAt,
    snoozedUntil: r.snoozedUntil ?? null,
  };
}

function reminderToApi(r) {
  const body = {
    title: r.title,
    due: iso(r.dueDate),
    priority: r.priority,
    repeat: r.repeat,
    notes: r.description ?? '',
    extras: pick(r, REMINDER_KNOWN),
  };
  return body;
}

const getAllReminders = async () => (await apiFetch('/api/reminders')).map(reminderFromApi);

// Writes go through writeOrQueue: with no connection they are queued (encrypted) and synced later.
const findReminder = async (id) => (await apiFetch('/api/reminders')).find((r) => r.id === id);

const createReminder = async (data) => {
  const json = { ...reminderToApi(data), id: newReminderId() }; // client id: a retried or queued create can't duplicate
  return writeOrQueue(
    { kind: 'reminder.create', data: json },
    async () => reminderChanged(reminderFromApi(await apiFetch('/api/reminders', { method: 'POST', json }))),
    () => reminderFromApi({ done: false, createdAt: new Date().toISOString(), ...json }),
    'reminders',
  );
};

const updateReminder = async (data) => {
  const json = { ...reminderToApi(data), done: Boolean(data.completed), snoozedUntil: data.snoozedUntil ? iso(data.snoozedUntil) : null };
  return writeOrQueue(
    { kind: 'reminder.update', reminderId: data.id, patch: json },
    async () => reminderChanged(reminderFromApi(await apiFetch(`/api/reminders/${encodeURIComponent(data.id)}`, { method: 'PUT', json }))),
    async () => reminderFromApi((await findReminder(data.id)) ?? { id: data.id, ...json }),
    'reminders',
  );
};

const toggleComplete = async (id) => {
  const current = await findReminder(id);
  if (!current) throw new Error('Reminder not found');
  const after = async () => reminderFromApi((await findReminder(id)) ?? current);
  if (current.done) {
    return writeOrQueue(
      { kind: 'reminder.update', reminderId: id, patch: { done: false } },
      async () => reminderChanged(reminderFromApi(await apiFetch(`/api/reminders/${id}`, { method: 'PUT', json: { done: false } }))),
      after,
      'reminders',
    );
  }
  return writeOrQueue(
    { kind: 'reminder.complete', reminderId: id },
    async () => reminderChanged(reminderFromApi(await apiFetch(`/api/reminders/${id}/complete`, { method: 'POST' }))),
    after,
    'reminders',
  );
};

// Nothing is deleted. Restoring an older backup in "replace" mode archives what is there first.
const archiveAllReminders = async () => {
  for (const r of await apiFetch('/api/reminders')) await apiFetch(`/api/reminders/${encodeURIComponent(r.id)}/archive`, { method: 'POST' });
  reminderChanged();
};

const journalFromApi = (e) => ({ ...(e.extras || {}), id: e.id, text: e.text, mood: e.mood, createdAt: e.createdAt });

export const getAllJournalEntries = async () => (await apiFetch('/api/journal')).map(journalFromApi);

export const createJournalEntry = async (entry) => {
  const json = { text: entry.text, extras: pick(entry, JOURNAL_KNOWN) };
  if (entry.id !== undefined) json.id = String(entry.id);
  if (entry.mood !== undefined) json.mood = entry.mood;
  if (entry.createdAt !== undefined) json.createdAt = iso(entry.createdAt);
  if (Object.keys(json.extras).length === 0) delete json.extras;
  return dailyChanged(journalFromApi(await apiFetch('/api/journal', { method: 'POST', json })));
};

export const updateJournalEntry = async (id, changes) => {
  const json = {};
  if (changes.text !== undefined) json.text = changes.text;
  if (changes.mood !== undefined) json.mood = changes.mood;
  const extras = pick(changes, JOURNAL_KNOWN);
  if (Object.keys(extras).length) json.extras = extras;
  return dailyChanged(journalFromApi(await apiFetch(`/api/journal/${id}`, { method: 'PUT', json })));
};

export const archiveAllJournalEntries = async () => {
  for (const e of await apiFetch('/api/journal')) await apiFetch(`/api/journal/${encodeURIComponent(e.id)}/archive`, { method: 'POST' });
  dailyChanged();
};

const remindersStore = { getAllReminders, createReminder, updateReminder, toggleComplete, archiveAllReminders };
export default remindersStore;
