import { apiFetch } from './api';
import { emitDataChanged } from './dataEvents';
import { newReminderId, writeOrQueue } from '../offline/instances';
import type { DaySummary, NoteSummary, Priority, Reminder, Repeat } from './types';

export async function listReminders(opts: { done?: boolean } = {}): Promise<Reminder[]> {
  const qs = opts.done === undefined ? '' : `?done=${opts.done}`;
  return apiFetch<Reminder[]>(`/api/reminders${qs}`);
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
  patch: Partial<Pick<Reminder, 'title' | 'due' | 'priority' | 'repeat' | 'notes'>>,
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

export async function deleteReminder(id: string): Promise<void> {
  await writeOrQueue(
    { kind: 'reminder.delete', reminderId: id },
    async () => {
      await apiFetch(`/api/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' });
      emitDataChanged('reminders');
    },
    () => undefined,
    'reminders',
  );
}

export async function listNotes(): Promise<NoteSummary[]> {
  return apiFetch<NoteSummary[]>('/api/notes');
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
