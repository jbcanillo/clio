import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { ApiError } from '../lib/api';

vi.mock('../lib/api', async (orig) => {
  const actual = await orig<typeof import('../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '../lib/api';
import { completeReminder, snoozeReminder, toggleChecklist, listReminders } from '../lib/clioApi';
import { emitDataChanged, useDataVersion } from '../lib/dataEvents';

const mocked = vi.mocked(apiFetch);

describe('clioApi', () => {
  let events: number;
  const onEvt = () => { events++; };
  beforeEach(() => { mocked.mockReset(); events = 0; window.addEventListener('clio:data-changed', onEvt); });
  afterEach(() => window.removeEventListener('clio:data-changed', onEvt));

  it('completeReminder POSTs complete and emits once', async () => {
    mocked.mockResolvedValue({ id: 'r1' });
    await completeReminder('r1');
    expect(mocked).toHaveBeenCalledWith('/api/reminders/r1/complete', { method: 'POST' });
    expect(events).toBe(1);
  });

  it('snoozeReminder POSTs until', async () => {
    mocked.mockResolvedValue({ id: 'r1' });
    await snoozeReminder('r1', '2026-01-01T00:00:00Z');
    expect(mocked).toHaveBeenCalledWith('/api/reminders/r1/snooze', { method: 'POST', json: { until: '2026-01-01T00:00:00Z' } });
    expect(events).toBe(1);
  });

  it('toggleChecklist PATCHes and rethrows 409 without emitting', async () => {
    mocked.mockResolvedValueOnce({ hash: 'h2' });
    await toggleChecklist('a.md', 1, true, 'h1');
    expect(mocked).toHaveBeenCalledWith('/api/notes/checklist', { method: 'PATCH', json: { path: 'a.md', index: 1, checked: true, baseHash: 'h1' } });
    expect(events).toBe(1);
    mocked.mockRejectedValueOnce(new ApiError(409, 'conflict'));
    await expect(toggleChecklist('a.md', 1, true, 'h1')).rejects.toMatchObject({ status: 409 });
    expect(events).toBe(1);
  });

  it('listReminders passes done filter', async () => {
    mocked.mockResolvedValue([]);
    await listReminders({ done: false });
    expect(mocked).toHaveBeenCalledWith('/api/reminders?done=false');
  });
});

describe('useDataVersion', () => {
  it('increments for own kind and all only', () => {
    const { result } = renderHook(() => useDataVersion('notes'));
    const start = result.current;
    act(() => emitDataChanged('reminders'));
    expect(result.current).toBe(start);
    act(() => emitDataChanged('notes'));
    expect(result.current).toBe(start + 1);
    act(() => emitDataChanged('all'));
    expect(result.current).toBe(start + 2);
  });
});
