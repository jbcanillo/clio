import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DiaryPage from '../pages/DiaryPage';
import type { DaySummary } from '../lib/types';

const dailyRange = vi.fn();
vi.mock('../lib/clioApi', async (orig) => ({ ...(await orig<object>()), dailyRange: (...a: unknown[]) => dailyRange(...a) }));
const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));
const loadDay = vi.fn();
const updateCheckin = vi.fn();
vi.mock('../lib/journal', async (orig) => ({
  ...(await orig<object>()),
  loadDay: (...a: unknown[]) => loadDay(...a),
  updateCheckin: (...a: unknown[]) => updateCheckin(...a),
}));
let journal: unknown[] = [];
vi.mock('../hooks/useJournal', () => ({ useJournal: () => ({ entries: journal }) }));
let chatProps: { scope: string; mode: string; placeholder: string; chips: { label: string }[] } | null = null;
vi.mock('../components/chat/ClioChat', () => ({
  ClioChat: (p: NonNullable<typeof chatProps>) => { chatProps = p; return <div data-testid="chat" />; },
}));
let actionProps: { scope: string; timezone: string } | null = null;
const saveCheckin = vi.fn();
vi.mock('../copilot/actions', async (orig) => ({
  ...(await orig<object>()),
  saveCheckin: (...a: unknown[]) => saveCheckin(...a),
  ClioActions: (p: NonNullable<typeof actionProps>) => { actionProps = p; return null; },
}));

// 2026-11-23 (Mon) 03:00 UTC is still Sun 2026-11-22 in Los Angeles; that week is Mon 16 .. Sun 22.
const NOW = new Date('2026-11-23T03:00:00Z');
const day = (date: string, o: Partial<DaySummary> = {}): DaySummary => ({
  date, mood: 4, energy: null, headline: `H-${date}`, hasEntry: true, sections: { thoughts: 1, ideas: 0, events: 0 }, ...o,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  dailyRange.mockReset().mockResolvedValue([]);
  apiFetch.mockReset().mockImplementation(async (p: string) => {
    if (p === '/api/settings') return { timezone: 'America/Los_Angeles' };
    throw new Error('unexpected ' + p);
  });
  saveCheckin.mockReset().mockResolvedValue(undefined);
  loadDay.mockReset();
  updateCheckin.mockReset().mockResolvedValue(undefined);
  journal = [];
  chatProps = null;
  actionProps = null;
});
afterEach(() => vi.useRealTimers());

describe('DiaryPage', () => {
  it('requests the owner-timezone week and shows the month header', async () => {
    render(<DiaryPage />);
    await waitFor(() => expect(dailyRange).toHaveBeenCalledWith('2026-11-16', '2026-11-22'));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(actionProps?.scope).toBe('diary');
    expect(actionProps?.timezone).toBe('America/Los_Angeles');
    expect(chatProps).toMatchObject({ scope: 'diary', mode: 'sheet', placeholder: 'Reflect with Clio…' });
    expect(chatProps?.chips.map((c) => c.label)).toEqual(['Reflect on today', "How's my week been?"]);
  });

  it('falls back to UTC when settings fail', async () => {
    apiFetch.mockRejectedValue(new Error('x'));
    render(<DiaryPage />);
    await waitFor(() => expect(dailyRange).toHaveBeenCalledWith('2026-11-23', '2026-11-29'));
  });

  it('previous week requests the previous 7-day range', async () => {
    render(<DiaryPage />);
    await waitFor(() => expect(dailyRange).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(dailyRange).toHaveBeenLastCalledWith('2026-11-09', '2026-11-15'));
  });

  it('shows the empty state with a check-in button', async () => {
    render(<DiaryPage />);
    expect(await screen.findByText('No entries this week yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Check in' }).length).toBeGreaterThan(0);
  });

  it('lists entries with the selected day first and interleaves legacy journal entries as text', async () => {
    dailyRange.mockResolvedValue([day('2026-11-17'), day('2026-11-20')]);
    journal = [
      { id: 1, text: '<img src=x onerror=alert(1)>', mood: '😀', createdAt: '2026-11-19T20:00:00Z' },
      { id: 2, text: 'outside week', mood: '😐', createdAt: '2026-11-01T20:00:00Z' },
    ];
    const { container } = render(<DiaryPage />);
    await screen.findByText('H-2026-11-20');
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('😀')).toBeInTheDocument();
    expect(screen.queryByText('outside week')).toBeNull();
    const order = Array.from(container.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(order[0]).toContain('H-2026-11-20');
    expect(order[1]).toContain('onerror');
    expect(order[2]).toContain('H-2026-11-17');
    await userEvent.click(screen.getByRole('button', { name: /Tue 17/ }));
    await waitFor(() => expect(container.querySelectorAll('li')[0].textContent).toContain('H-2026-11-17'));
  });

  it('check-in saves for the selected date and closes (saveCheckin itself emits daily)', async () => {
    render(<DiaryPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Check in' }))[0]);
    expect(screen.getByRole('dialog', { name: 'Daily check-in' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Mood 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
    await waitFor(() => expect(saveCheckin).toHaveBeenCalledWith('2026-11-22', expect.objectContaining({ mood: 4 })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('check-in failure keeps the form open with an error', async () => {
    saveCheckin.mockRejectedValue(new Error('nope'));
    render(<DiaryPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Check in' }))[0]);
    await userEvent.click(screen.getByRole('radio', { name: 'Mood 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
    expect(await screen.findByText(/Couldn't save your check-in/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Daily check-in' })).toBeInTheDocument();
  });

  it('fetch error is retryable and the chat stays present', async () => {
    dailyRange.mockRejectedValueOnce(new Error('boom'));
    render(<DiaryPage />);
    const alert = await screen.findByRole('alert');
    expect(screen.getByTestId('chat')).toBeInTheDocument();
    dailyRange.mockResolvedValue([day('2026-11-20')]);
    await act(async () => { await userEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(await screen.findByText('H-2026-11-20')).toBeInTheDocument();
    expect(alert).not.toBeInTheDocument();
  });

  it('tapping a logged day opens it for editing and saves the changes', async () => {
    dailyRange.mockResolvedValue([day('2026-11-20')]);
    loadDay.mockResolvedValue({ baseHash: 'h1', values: { mood: 3, events: 'Old event', thoughts: '', ideas: '', photos: [], people: [], places: [] } });
    render(<DiaryPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit 2026-11-20' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit 2026-11-20' });
    expect(loadDay).toHaveBeenCalledWith('2026-11-20');
    const events = await within(dialog).findByLabelText(/what happened/i);
    expect(events).toHaveValue('Old event');
    await userEvent.clear(events);
    await userEvent.type(events, 'New event');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateCheckin).toHaveBeenCalledWith('2026-11-20', expect.objectContaining({ mood: 3, events: 'New event' }), 'h1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('an edit that fails keeps the form open with the reason', async () => {
    dailyRange.mockResolvedValue([day('2026-11-20')]);
    loadDay.mockResolvedValue({ baseHash: 'h1', values: { mood: 3, events: '', thoughts: '', ideas: '', photos: [], people: [], places: [] } });
    updateCheckin.mockRejectedValue(new Error('This day changed somewhere else.'));
    render(<DiaryPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit 2026-11-20' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed somewhere else');
    expect(screen.getByRole('dialog', { name: 'Edit 2026-11-20' })).toBeInTheDocument();
  });
});
