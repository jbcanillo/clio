import { apiFetch } from './api';
import { emitDataChanged } from './dataEvents';
import type { DaySummary, NoteSummary, Priority, Reminder, Repeat } from './types';

export async function listReminders(opts: { done?: boolean } = {}): Promise<Reminder[]> {
  const qs = opts.done === undefined ? '' : `?done=${opts.done}`;
  return apiFetch<Reminder[]>(`/api/reminders${qs}`);
}

export async function completeReminder(id: string): Promise<Reminder> {
  const r = await apiFetch<Reminder>(`/api/reminders/${encodeURIComponent(id)}/complete`, { method: 'POST' });
  emitDataChanged('reminders');
  return r;
}

export async function snoozeReminder(id: string, until: string): Promise<Reminder> {
  const r = await apiFetch<Reminder>(`/api/reminders/${encodeURIComponent(id)}/snooze`, { method: 'POST', json: { until } });
  emitDataChanged('reminders');
  return r;
}

export async function updateReminder(
  id: string,
  patch: Partial<Pick<Reminder, 'title' | 'due' | 'priority' | 'repeat' | 'notes'>>,
): Promise<Reminder> {
  const r = await apiFetch<Reminder>(`/api/reminders/${encodeURIComponent(id)}`, { method: 'PUT', json: patch });
  emitDataChanged('reminders');
  return r;
}

export async function createReminder(
  input: { title: string; due: string; priority?: Priority; repeat?: Repeat; notes?: string },
): Promise<Reminder> {
  const r = await apiFetch<Reminder>('/api/reminders', { method: 'POST', json: input });
  emitDataChanged('reminders');
  return r;
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
