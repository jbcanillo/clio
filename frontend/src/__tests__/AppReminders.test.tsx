import { act, render, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitDataChanged } from '../lib/dataEvents';

vi.mock('../copilot/ScopedCopilot', () => ({ ScopedCopilot: ({ children }: { children: unknown }) => children }));
vi.mock('../pages/ChatPage', () => ({ default: () => null }));
vi.mock('../pages/RemindersPage', () => ({ default: () => null }));
vi.mock('../pages/DiaryPage', () => ({ default: () => null }));
vi.mock('../pages/NotesPage', () => ({ default: () => null }));
vi.mock('../components/features/NotificationManager', () => ({ default: () => null }));
vi.mock('../offline', () => ({ outbox: {} }));
vi.mock('../offline/useOnlineSync', () => ({ useOnlineSync: () => ({ pending: 0 }) }));

const getAllReminders = vi.fn();
const storeUpdate = vi.fn();
vi.mock('../utils/store', () => ({ default: { getAllReminders: () => getAllReminders(), updateReminder: (...a: unknown[]) => storeUpdate(...a) } }));
const snoozeReminder = vi.fn().mockResolvedValue({});
const completeReminder = vi.fn().mockResolvedValue({});
vi.mock('../lib/clioApi', async (orig) => ({
  ...(await orig<object>()),
  snoozeReminder: (...a: unknown[]) => snoozeReminder(...a),
  completeReminder: (...a: unknown[]) => completeReminder(...a),
}));
const upsertAlarm = vi.fn();
const deleteAlarm = vi.fn();
vi.mock('../utils/notificationSync', () => ({
  upsertAlarm: (...a: unknown[]) => upsertAlarm(...a), deleteAlarm: (...a: unknown[]) => deleteAlarm(...a), requestNotificationPermission: vi.fn(),
}));
const updateNotification = vi.fn();
const removeNotification = vi.fn();
vi.mock('../utils/notifications', () => ({
  updateNotificationForReminder: (...a: unknown[]) => updateNotification(...a),
  removeNotificationForReminder: (...a: unknown[]) => removeNotification(...a),
}));

import App from '../App';

const r = (id: string, o: Record<string, unknown> = {}) => ({ id, title: id, dueDate: '2099-01-01T09:00:00.000Z', completed: false, snoozedUntil: null, ...o });

function renderApp() {
  window.location.hash = '#/chat';
  return render(<HashRouter><App /></HashRouter>);
}

describe('App reminder sync', () => {
  beforeEach(() => {
    for (const f of [getAllReminders, storeUpdate, snoozeReminder, completeReminder, upsertAlarm, deleteAlarm, updateNotification, removeNotification]) f.mockClear();
  });

  it("refetches on a 'reminders' change and re-syncs alarms on fresh data", async () => {
    getAllReminders.mockResolvedValue([r('a'), r('b')]);
    renderApp();
    await waitFor(() => expect(upsertAlarm).toHaveBeenCalledTimes(2));
    expect(getAllReminders).toHaveBeenCalledTimes(1);

    // Clio completed 'a', deleted 'b' and created 'c' in a chat run.
    getAllReminders.mockResolvedValue([r('a', { completed: true }), r('c')]);
    act(() => emitDataChanged('reminders'));
    await waitFor(() => expect(getAllReminders).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(deleteAlarm).toHaveBeenCalledWith('a'));
    expect(deleteAlarm).toHaveBeenCalledWith('b');
    expect(removeNotification).toHaveBeenCalledWith('a');
    expect(removeNotification).toHaveBeenCalledWith('b');
    expect(upsertAlarm).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c' }));
    expect(upsertAlarm).toHaveBeenCalledTimes(3); // unchanged reminders are not re-scheduled
  });

  it('notification Snooze sends only id/until (no full PUT); Complete uses the complete endpoint', async () => {
    getAllReminders.mockResolvedValue([r('a')]);
    renderApp();
    await waitFor(() => expect(upsertAlarm).toHaveBeenCalled());
    const until = Date.parse('2099-01-01T09:05:00.000Z');
    act(() => { window.dispatchEvent(new CustomEvent('snooze-reminder-app', { detail: { reminderId: 'a', snoozeUntil: until } })); });
    expect(snoozeReminder).toHaveBeenCalledWith('a', '2099-01-01T09:05:00.000Z');
    act(() => { window.dispatchEvent(new CustomEvent('complete-reminder-app', { detail: { reminderId: 'a' } })); });
    expect(completeReminder).toHaveBeenCalledWith('a');
    expect(storeUpdate).not.toHaveBeenCalled();
  });
});
