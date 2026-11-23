// Reminders and journal entries live in the vault, behind the Clio API.
// This module keeps the function names and object shapes of the old IndexedDB
// layer (utils/db.js) so the existing hooks and components work unchanged.
import { apiFetch } from '../lib/api';

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

const createReminder = async (data) =>
  reminderFromApi(await apiFetch('/api/reminders', { method: 'POST', json: reminderToApi(data) }));

const updateReminder = async (data) => {
  const json = { ...reminderToApi(data), done: Boolean(data.completed), snoozedUntil: data.snoozedUntil ? iso(data.snoozedUntil) : null };
  return reminderFromApi(await apiFetch(`/api/reminders/${data.id}`, { method: 'PUT', json }));
};

const deleteReminder = async (id) => { await apiFetch(`/api/reminders/${id}`, { method: 'DELETE' }); };

const toggleComplete = async (id) => {
  const current = (await apiFetch('/api/reminders')).find((r) => r.id === id);
  if (!current) throw new Error('Reminder not found');
  const saved = current.done
    ? await apiFetch(`/api/reminders/${id}`, { method: 'PUT', json: { done: false } })
    : await apiFetch(`/api/reminders/${id}/complete`, { method: 'POST' });
  return reminderFromApi(saved);
};

const deleteAllReminders = async () => {
  for (const r of await apiFetch('/api/reminders')) await deleteReminder(r.id);
};

const journalFromApi = (e) => ({ ...(e.extras || {}), id: e.id, text: e.text, mood: e.mood, createdAt: e.createdAt });

export const getAllJournalEntries = async () => (await apiFetch('/api/journal')).map(journalFromApi);

export const createJournalEntry = async (entry) => {
  const json = { text: entry.text, extras: pick(entry, JOURNAL_KNOWN) };
  if (entry.id !== undefined) json.id = String(entry.id);
  if (entry.mood !== undefined) json.mood = entry.mood;
  if (entry.createdAt !== undefined) json.createdAt = iso(entry.createdAt);
  if (Object.keys(json.extras).length === 0) delete json.extras;
  return journalFromApi(await apiFetch('/api/journal', { method: 'POST', json }));
};

export const updateJournalEntry = async (id, changes) => {
  const json = {};
  if (changes.text !== undefined) json.text = changes.text;
  if (changes.mood !== undefined) json.mood = changes.mood;
  const extras = pick(changes, JOURNAL_KNOWN);
  if (Object.keys(extras).length) json.extras = extras;
  return journalFromApi(await apiFetch(`/api/journal/${id}`, { method: 'PUT', json }));
};

export const deleteJournalEntry = async (id) => { await apiFetch(`/api/journal/${id}`, { method: 'DELETE' }); };

export const deleteAllJournalEntries = async () => {
  for (const e of await apiFetch('/api/journal')) await deleteJournalEntry(e.id);
};

const remindersStore = { getAllReminders, createReminder, updateReminder, deleteReminder, toggleComplete, deleteAllReminders };
export default remindersStore;
