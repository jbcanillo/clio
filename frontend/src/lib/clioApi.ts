import { apiFetch } from './api';
import { emitDataChanged } from './dataEvents';
import { newReminderId, writeOrQueue } from '../offline/instances';
import type { DaySummary, NoteSummary, Priority, Reminder, Repeat } from './types';

export async function listReminders(opts: { done?: boolean; archived?: boolean } = {}): Promise<Reminder[]> {
  const q = new URLSearchParams();
  if (opts.done !== undefined) q.set('done', String(opts.done));
  if (opts.archived) q.set('archived', 'true');
  const qs = q.toString();
  return apiFetch<Reminder[]>(`/api/reminders${qs ? `?${qs}` : ''}`);
}

// Writes go through writeOrQueue: with no connection they are queued (encrypted) and synced later.
// Offline, the return value is a best guess; screens refetch and see the queued change via the overlay.
const cachedReminder = async (id: string): Promise<Reminder> =>
  (await listReminders().catch(() => [] as Reminder[])).find((r) => r.id === id) ?? ({ id } as Reminder);

export async function completeReminder(id: string): Promise<Reminder> {
  return writeOrQueue(
    { kind: 'reminder.complete', reminderId: id },
    async () => {
      const r = await apiFetch<Reminder>(`/api/reminders/${encodeURIComponent(id)}/complete`, { method: 'POST' });
      emitDataChanged('reminders');
      return r;
    },
    () => cachedReminder(id),
    'reminders',
  );
}

export async function snoozeReminder(id: string, until: string): Promise<Reminder> {
  return writeOrQueue(
    { kind: 'reminder.snooze', reminderId: id, until },
    async () => {
      const r = await apiFetch<Reminder>(`/api/reminders/${encodeURIComponent(id)}/snooze`, { method: 'POST', json: { until } });
      emitDataChanged('reminders');
      return r;
    },
    () => cachedReminder(id),
    'reminders',
  );
}

export async function updateReminder(
  id: string,
  patch: Partial<Pick<Reminder, 'title' | 'due' | 'priority' | 'repeat' | 'notes' | 'extras' | 'done'>>,
): Promise<Reminder> {
  return writeOrQueue(
    { kind: 'reminder.update', reminderId: id, patch },
    async () => {
      const r = await apiFetch<Reminder>(`/api/reminders/${encodeURIComponent(id)}`, { method: 'PUT', json: patch });
      emitDataChanged('reminders');
      return r;
    },
    () => cachedReminder(id),
    'reminders',
  );
}

export async function createReminder(
  input: { title: string; due: string; priority?: Priority; repeat?: Repeat; notes?: string },
): Promise<Reminder> {
  const data = { ...input, id: newReminderId() }; // client id: a retried or queued create can't duplicate
  return writeOrQueue(
    { kind: 'reminder.create', data },
    async () => {
      const r = await apiFetch<Reminder>('/api/reminders', { method: 'POST', json: data });
      emitDataChanged('reminders');
      return r;
    },
    () => ({ priority: 'medium', repeat: 'never', notes: '', done: false, ...data }) as Reminder,
    'reminders',
  );
}

// Nothing in Clio is deleted. Reminders, notes, diary days and journal entries are archived:
// hidden from the normal lists, kept in the vault and in backups, and restorable from "Archived".

/** Archives (or, with `archived: false`, restores) a reminder. Queued when offline. */
export async function archiveReminder(id: string, archived = true): Promise<Reminder> {
  return writeOrQueue(
    { kind: 'reminder.archive', reminderId: id, archived },
    async () => {
      const r = await apiFetch<Reminder>(`/api/reminders/${encodeURIComponent(id)}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' });
      emitDataChanged('reminders');
      return r;
    },
    () => cachedReminder(id),
    'reminders',
  );
}

export async function listNotes(opts: { archived?: boolean } = {}): Promise<NoteSummary[]> {
  return apiFetch<NoteSummary[]>(opts.archived ? '/api/notes?archived=true' : '/api/notes');
}

export async function archiveNote(path: string, archived = true): Promise<{ hash: string }> {
  const r = await apiFetch<{ hash: string }>('/api/notes/archive', { method: 'POST', json: { path, archived } });
  emitDataChanged('notes');
  return r;
}

export async function archivedDays(): Promise<DaySummary[]> {
  return apiFetch<DaySummary[]>('/api/daily/archived');
}

export async function archiveDay(date: string, archived = true): Promise<void> {
  await apiFetch(`/api/daily/${encodeURIComponent(date)}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' });
  emitDataChanged('daily');
}

export interface JournalEntry { id: string; text: string; mood?: string | number | null; createdAt: string; archived?: boolean; archivedAt?: string }

export async function listJournal(opts: { archived?: boolean } = {}): Promise<JournalEntry[]> {
  return apiFetch<JournalEntry[]>(opts.archived ? '/api/journal?archived=true' : '/api/journal');
}

export async function archiveJournalEntry(id: string, archived = true): Promise<JournalEntry> {
  const r = await apiFetch<JournalEntry>(`/api/journal/${encodeURIComponent(id)}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' });
  emitDataChanged('daily');
  return r;
}

export async function toggleChecklist(
  path: string, index: number, checked: boolean, baseHash: string,
): Promise<{ hash: string }> {
  const r = await apiFetch<{ hash: string }>('/api/notes/checklist', {
    method: 'PATCH', json: { path, index, checked, baseHash },
  });
  emitDataChanged('notes');
  return r;
}

export async function dailyRange(from: string, to: string): Promise<DaySummary[]> {
  return apiFetch<DaySummary[]>(`/api/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}
