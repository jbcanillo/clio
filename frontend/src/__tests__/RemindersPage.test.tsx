import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RemindersPage from '../pages/RemindersPage';
import { emitDataChanged } from '../lib/dataEvents';
import type { Reminder } from '../lib/types';

const listReminders = vi.fn();
const archiveReminder = vi.fn();
const updateReminderApi = vi.fn();
vi.mock('../lib/clioApi', async (orig) => ({
  ...(await orig<object>()),
  listReminders: (...a: unknown[]) => listReminders(...a),
  archiveReminder: (...a: unknown[]) => archiveReminder(...a),
  updateReminder: (...a: unknown[]) => updateReminderApi(...a),
  completeReminder: vi.fn(),
  snoozeReminder: vi.fn(),
}));
const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));
let chatProps: { scope: string; mode: string; placeholder: string; chips: { label: string; prompt: string }[] } | null = null;
vi.mock('../components/chat/ClioChat', () => ({
  ClioChat: (p: NonNullable<typeof chatProps>) => {
    chatProps = p;
    return <div data-testid="chat" />;
  },
}));
let actionProps: { scope: string; timezone: string } | null = null;
vi.mock('../copilot/actions', async (orig) => ({
  ...(await orig<object>()),
  ClioActions: (p: NonNullable<typeof actionProps>) => {
    actionProps = p;
    return null;
  },
}));
const updateReminder = vi.fn();
const createReminder = vi.fn();
const addToast = vi.fn();
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ addToast }) }));
vi.mock('../hooks/useReminders', () => ({ useReminders: () => ({ createReminder, updateReminder }) }));
vi.mock('../components/features/AddReminderForm', () => ({
  default: ({ onSubmit, onDismiss }: { onSubmit: (d: unknown) => Promise<void>; onDismiss: () => void }) => (
    <button onClick={async () => { await onSubmit({ title: 'New' }); onDismiss(); }}>create-reminder</button>
  ),
}));
vi.mock('../components/features/EditReminderFormModal', () => ({
  default: ({ reminder, onSubmit, onDismiss, onToast }: { reminder: { id: string; dueDate: string }; onSubmit: (d: unknown) => Promise<void>; onDismiss: () => void; onToast: (m: string, t: string) => void }) => (
    <div role="dialog">
      <span>editing {reminder.id}</span>
      {/* mirrors the real modal: dismiss + success toast on resolve, error toast and stay open on reject */}
      <button onClick={async () => { try { await onSubmit({ title: 'Renamed' }); onDismiss(); onToast('Reminder updated', 'success'); } catch (e) { onToast((e as Error).message, 'error'); } }}>save-edit</button>
    </div>
  ),
}));

// 2026-06-10 02:00 UTC is still 2026-06-09 in Los Angeles (UTC-7).
const NOW = new Date('2026-06-10T02:00:00Z');
const mk = (id: string, o: Partial<Reminder> = {}): Reminder => ({
  id, title: `T-${id}`, due: '2026-06-09T20:00:00.000Z', priority: 'medium', repeat: 'never', done: false, notes: '', ...o,
});

function settings(tz = 'America/Los_Angeles') {
  apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/settings') return { timezone: tz };
    throw new Error('unexpected ' + path);
  });
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reminders']}>
      <Routes>
        <Route path="/reminders" element={<RemindersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  listReminders.mockReset();
  updateReminderApi.mockReset();
  apiFetch.mockReset();
  updateReminder.mockReset();
  createReminder.mockReset();
  addToast.mockReset();
  chatProps = null;
  actionProps = null;
  settings();
});
afterEach(() => vi.useRealTimers());

describe('RemindersPage', () => {
  it('shows header, synced pill and the chat config', async () => {
    listReminders.mockResolvedValue([mk('a')]);
    renderPage();
    expect(await screen.findByText('T-a')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reminders' })).toBeInTheDocument();
    expect(screen.getByText(/^Synced/)).toBeInTheDocument();
    expect(chatProps?.scope).toBe('reminders');
    expect(chatProps?.mode).toBe('sheet');
    expect(chatProps?.placeholder).toBe('Remind me to…');
    expect(chatProps?.chips.map((c) => c.label)).toEqual(['Remind me to…', 'Reschedule my afternoon']);
    expect(actionProps?.scope).toBe('reminders');
  });

  it('empty list shows a friendly card with an Add reminder action', async () => {
    listReminders.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no reminders yet/i)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Add reminder' }).slice(-1)[0]);
    expect(screen.getByRole('dialog', { name: 'New reminder' })).toBeInTheDocument();
  });

  it('plus button opens the new reminder sheet and closes it after saving', async () => {
    listReminders.mockResolvedValue([mk('a')]);
    createReminder.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('T-a');
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    expect(screen.getByRole('dialog', { name: 'New reminder' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'create-reminder' }));
    expect(createReminder).toHaveBeenCalledWith({ title: 'New' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New reminder' })).toBeNull());
  });

  it('?new=1 opens the new reminder sheet', async () => {
    listReminders.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={['/reminders?new=1']}>
        <Routes><Route path="/reminders" element={<RemindersPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('dialog', { name: 'New reminder' })).toBeInTheDocument();
  });

  it('High priority group lists only high not-done reminders', async () => {
    listReminders.mockResolvedValue([
      mk('h1', { priority: 'high' }),
      mk('h2', { priority: 'high', done: true }),
      mk('m1'),
    ]);
    renderPage();
    await screen.findByText('T-h1');
    const group = screen.getByText(/high priority/i).closest('section')!;
    expect(within(group).getByText('T-h1')).toBeInTheDocument();
    expect(within(group).queryByText('T-m1')).toBeNull();
    expect(within(group).queryByText('T-h2')).toBeNull();
  });

  it('Due today filter uses the owner timezone, not UTC', async () => {
    listReminders.mockResolvedValue([
      mk('today', { due: '2026-06-09T20:00:00.000Z' }),
      mk('laEvening', { due: '2026-06-10T01:00:00.000Z' }), // LA 06-09 18:00 = today (UTC says tomorrow)
      mk('tomorrowLA', { due: '2026-06-10T08:00:00.000Z' }), // LA 06-10 01:00 = tomorrow
    ]);
    renderPage();
    await screen.findByText('T-today');
    expect(screen.getByRole('button', { name: /^Due today 2$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Due today/ }));
    expect(screen.getByText('T-today')).toBeInTheDocument();
    expect(screen.getByText('T-laEvening')).toBeInTheDocument();
    expect(screen.queryByText('T-tomorrowLA')).toBeNull();
  });

  it('Snoozed filter shows only future-snoozed reminders', async () => {
    listReminders.mockResolvedValue([
      mk('s', { snoozedUntil: '2026-06-11T00:00:00.000Z' }),
      mk('past', { snoozedUntil: '2026-06-01T00:00:00.000Z' }),
      mk('plain'),
    ]);
    renderPage();
    await screen.findByText('T-s');
    expect(screen.getByRole('button', { name: /^Snoozed 1$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Snoozed/ }));
    expect(screen.getByText('T-s')).toBeInTheDocument();
    expect(screen.queryByText('T-plain')).toBeNull();
    expect(screen.queryByText('T-past')).toBeNull();
  });

  it('progress text for 3 completed today + 2 due today', async () => {
    const done = (id: string) => mk(id, { done: true, completedAt: '2026-06-09T18:00:00.000Z' });
    listReminders.mockResolvedValue([done('d1'), done('d2'), done('d3'), mk('u1'), mk('u2'), mk('old', { done: true, completedAt: '2026-06-01T18:00:00.000Z' })]);
    renderPage();
    expect(await screen.findByText('3 of 5 loops fulfilled today')).toBeInTheDocument();
    expect(screen.getByText(/completed reminders \(4\)/i)).toBeInTheDocument();
    expect(screen.getByText('T-old')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
  });

  it('can return a completed reminder to uncompleted', async () => {
    listReminders.mockResolvedValue([mk('done', { done: true, completedAt: '2026-06-01T18:00:00.000Z' })]);
    updateReminderApi.mockResolvedValue({});
    renderPage();
    await screen.findByText('T-done');

    await userEvent.click(screen.getByRole('button', { name: 'Mark uncompleted' }));

    expect(updateReminderApi).toHaveBeenCalledWith('done', { done: false });
  });

  it('falls back to due-today for done reminders without completedAt', async () => {
    listReminders.mockResolvedValue([mk('x', { done: true }), mk('y')]);
    renderPage();
    expect(await screen.findByText('1 of 2 loops fulfilled today')).toBeInTheDocument();
  });

  it('0 of 0 shows "No reminders due today", never NaN', async () => {
    listReminders.mockResolvedValue([mk('far', { due: '2026-07-01T09:00:00.000Z' })]);
    renderPage();
    expect(await screen.findByText('No reminders due today')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('renders 150 reminders', async () => {
    listReminders.mockResolvedValue(Array.from({ length: 150 }, (_, i) => mk(`n${i}`, { due: '2026-07-01T09:00:00.000Z' })));
    renderPage();
    await screen.findByText('T-n0');
    expect(screen.getAllByRole('checkbox')).toHaveLength(150);
  });

  it('refetches when reminders data changes', async () => {
    listReminders.mockResolvedValue([mk('a')]);
    renderPage();
    await screen.findByText('T-a');
    listReminders.mockResolvedValue([mk('b')]);
    act(() => emitDataChanged('reminders'));
    expect(await screen.findByText('T-b')).toBeInTheDocument();
    expect(listReminders).toHaveBeenCalledTimes(2);
    expect(listReminders).toHaveBeenCalledWith();
  });

  it('a hidden-but-mounted page refetches after a create through the legacy store', async () => {
    const { default: store } = await import('../utils/store');
    apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/settings') return { timezone: 'America/Los_Angeles' };
      if (path === '/api/reminders' && init?.method === 'POST') return { ...mk('new'), title: 'Created elsewhere', createdAt: NOW.toISOString() };
      throw new Error('unexpected ' + path);
    });
    listReminders.mockResolvedValue([mk('a')]);
    render(
      <div hidden>
        <MemoryRouter initialEntries={['/reminders']}><RemindersPage /></MemoryRouter>
      </div>,
    );
    await waitFor(() => expect(listReminders).toHaveBeenCalledTimes(1));
    listReminders.mockResolvedValue([mk('a'), { ...mk('new'), title: 'Created elsewhere' }]);
    await act(async () => { await store.createReminder({ title: 'Created elsewhere', dueDate: '2026-06-09T20:00:00.000Z' }); });
    await waitFor(() => expect(listReminders).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Created elsewhere', {}, { hidden: true } as never)).toBeInTheDocument();
  });

  it('passes the owner timezone to the cards (due shown in that zone)', async () => {
    settings('Asia/Tokyo');
    listReminders.mockResolvedValue([mk('a', { due: '2026-06-10T00:00:00.000Z' })]);
    renderPage();
    await screen.findByText('T-a');
    // 00:00 UTC is 09:00 in Tokyo.
    await waitFor(() => expect(screen.getByText(/09:00/)).toBeInTheDocument());
  });

  it('fetch failure shows a retryable alert and keeps the chat', async () => {
    listReminders.mockRejectedValueOnce(new Error('down'));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(screen.getByTestId('chat')).toBeInTheDocument();
    listReminders.mockResolvedValue([mk('a')]);
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('T-a')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falls back to UTC when the timezone is invalid or settings fail', async () => {
    listReminders.mockResolvedValue([mk('a')]);
    settings('Not/AZone');
    const r = renderPage();
    await screen.findByText('T-a');
    await waitFor(() => expect(actionProps?.timezone).toBe('UTC'));
    r.unmount();
    actionProps = null;
    apiFetch.mockRejectedValue(new Error('no'));
    renderPage();
    await screen.findByText('T-a');
    await waitFor(() => expect(actionProps?.timezone).toBe('UTC'));
  });

  it('Edit opens the modal and saves the converted legacy shape', async () => {
    listReminders.mockResolvedValue([mk('e1', { notes: 'bring card' })]);
    // The real hook writes through utils/store, which emits 'reminders' on success (covered in store.test.js).
    updateReminder.mockImplementation(async () => { emitDataChanged('reminders'); return {}; });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'T-e1' }));
    expect(screen.getByText('editing e1')).toBeInTheDocument();
    listReminders.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'save-edit' }));
    await waitFor(() => expect(updateReminder).toHaveBeenCalled());
    expect(updateReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1', title: 'Renamed', description: 'bring card', dueDate: '2026-06-09T20:00:00.000Z', completed: false }));
    await waitFor(() => expect(listReminders).toHaveBeenCalled());
  });

  it('failed Edit save shows an error toast and keeps the modal open', async () => {
    listReminders.mockResolvedValue([mk('e1')]);
    updateReminder.mockRejectedValue(new Error('Failed to update reminder'));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'T-e1' }));
    await userEvent.click(screen.getByRole('button', { name: 'save-edit' }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Failed to update reminder', 'error'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('successful Edit save closes the modal with a success toast', async () => {
    listReminders.mockResolvedValue([mk('e1')]);
    updateReminder.mockResolvedValue({});
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'T-e1' }));
    await userEvent.click(screen.getByRole('button', { name: 'save-edit' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(addToast).toHaveBeenCalledWith('Reminder updated', 'success');
  });

  it('overdue reminders count as due: 1 overdue + 1 today + 1 completed today', async () => {
    listReminders.mockResolvedValue([
      mk('over', { due: '2026-06-01T20:00:00.000Z' }),
      mk('today'),
      mk('c', { done: true, completedAt: '2026-06-09T18:00:00.000Z' }),
    ]);
    renderPage();
    expect(await screen.findByText('1 of 3 loops fulfilled today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Due today 2$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Due today/ }));
    expect(screen.getByText('T-over')).toBeInTheDocument();
  });
});

describe('RemindersPage: daily rhythm and archiving', () => {
  it('shows the daily rhythm above the reminders list', async () => {
    settings();
    listReminders.mockResolvedValue([mk('a')]);
    renderPage();
    const rhythm = await screen.findByRole('progressbar', { name: 'Daily rhythm' });
    const card = await screen.findByText('T-a');
    expect(rhythm.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('archives from a card (no delete anywhere) and lists archived reminders with Unarchive', async () => {
    settings();
    archiveReminder.mockReset().mockResolvedValue({});
    listReminders.mockImplementation(async (opts?: { archived?: boolean }) => (opts?.archived ? [mk('old', { title: 'Old one', archived: true })] : [mk('a')]));
    renderPage();
    await screen.findByText('T-a');
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
    await act(async () => { screen.getByRole('button', { name: 'Archive T-a' }).click(); });
    expect(archiveReminder).toHaveBeenCalledWith('a', true);

    await act(async () => { screen.getByRole('button', { name: 'Archived' }).click(); });
    const section = await screen.findByRole('region', { name: 'Archived reminders' });
    expect(await within(section).findByText('Old one')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: /snooze/i })).toBeNull();
    await act(async () => { within(section).getByRole('button', { name: 'Unarchive Old one' }).click(); });
    expect(archiveReminder).toHaveBeenCalledWith('old', false);
    expect(listReminders).toHaveBeenCalledWith({ archived: true });
  });

  it('keeps the Archived view reachable when there are no active reminders', async () => {
    settings();
    listReminders.mockImplementation(async (opts?: { archived?: boolean }) => (opts?.archived ? [mk('old', { title: 'Old one', archived: true })] : []));
    renderPage();
    await screen.findByText('No reminders yet');
    await act(async () => { (await screen.findByRole('button', { name: 'Archived' })).click(); });
    expect(await screen.findByText('Old one')).toBeInTheDocument();
  });
});
