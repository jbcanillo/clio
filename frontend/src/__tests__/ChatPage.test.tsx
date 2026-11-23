import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChatPage from '../pages/ChatPage';
import { saveNote } from '../offline';
import { todayIn } from '../lib/today';

const sendMessage = vi.fn();
let chatProps: { chips: { label: string; prompt: string }[]; empty?: ReactNode; scope: string; mode: string; placeholder: string } | null = null;
vi.mock('../components/chat/ClioChat', () => ({
  ClioChat: (p: NonNullable<typeof chatProps>) => {
    chatProps = p;
    return <div data-testid="chat">{p.empty}</div>;
  },
}));
vi.mock('@copilotkit/react-core', async (orig) => ({ ...(await orig<object>()), useCopilotChatInternal: () => ({ sendMessage }) }));
vi.mock('../copilot/actions', async (orig) => ({ ...(await orig<object>()), ClioActions: () => null }));
vi.mock('../offline', () => ({ outbox: { flush: async () => ({ sent: 0, conflicts: [], failed: 0, locked: false }), pending: async () => 0 }, saveNote: vi.fn() }));
const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));

beforeEach(() => {
  apiFetch.mockReset();
  sendMessage.mockReset();
  vi.mocked(saveNote).mockReset();
  chatProps = null;
  apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/settings') return { timezone: 'UTC', openrouterKeySet: true, openrouterModel: 'm', checkinTimes: { morning: '09:00', evening: '20:30' } };
    if (path === '/api/session/share') return { on: false };
    return { ok: true };
  });
});
afterEach(() => window.history.replaceState(null, '', '/'));

const renderPage = () => render(<MemoryRouter><ChatPage /></MemoryRouter>);
const entryCalls = () => apiFetch.mock.calls.filter(([p]) => /\/api\/daily\/.*\/entries/.test(p));

describe('ChatPage check-in', () => {
  it('does not show the check-in form on a normal visit', async () => {
    renderPage();
    expect(await screen.findByTestId('chat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save check-in/i })).toBeNull();
  });
  it('shows the check-in form when opened from the notification (?checkin=1)', async () => {
    window.history.replaceState(null, '', '/?checkin=1');
    renderPage();
    expect(await screen.findByRole('button', { name: /save check-in/i })).toBeInTheDocument();
  });
  it('saves mood and only the non-empty fields (two requests), then asks Clio to follow up', async () => {
    window.history.replaceState(null, '', '/?checkin=1');
    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: 'Mood 3' }));
    await userEvent.type(screen.getByLabelText(/what happened/i), 'dentist');
    await userEvent.click(screen.getByRole('button', { name: /save check-in/i }));
    await waitFor(() => expect(entryCalls()).toHaveLength(2));
    expect(entryCalls().map(([, init]) => init.json)).toEqual([{ mood: 3 }, { section: 'events', text: 'dentist' }]);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', content: expect.stringContaining('Mood: 3/5') }));
    expect(screen.queryByRole('button', { name: /save check-in/i })).toBeNull();
  });
  it('"Skip today" snoozes the check-in on the server and hides the form', async () => {
    window.history.replaceState(null, '', '/?checkin=1');
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /skip today/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/checkin/snooze', { method: 'POST' }));
    expect(screen.queryByRole('button', { name: /save check-in/i })).toBeNull();
  });
  it('shows an error and keeps the form when saving fails', async () => {
    window.history.replaceState(null, '', '/?checkin=1');
    apiFetch.mockImplementation(async (path: string) => {
      if (/entries/.test(path)) throw new Error('boom');
      if (path === '/api/settings') return { timezone: 'UTC' };
      return { on: false };
    });
    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: 'Mood 4' }));
    await userEvent.click(screen.getByRole('button', { name: /save check-in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save/i);
    expect(screen.getByRole('button', { name: /save check-in/i })).toBeInTheDocument();
  });
});

describe('ChatPage shell', () => {
  it('renders ClioChat in full mode with the three chips and the greeting', async () => {
    renderPage();
    expect(await screen.findByTestId('chat')).toHaveTextContent(/Hi, I'm Clio\. How was your day\?/);
    expect(chatProps?.scope).toBe('chat');
    expect(chatProps?.mode).toBe('full');
    expect(chatProps?.placeholder).toBe('Talk, type, or brainstorm…');
    expect(chatProps?.chips.map((c) => c.label)).toEqual(["Reflect on today's wins", 'Set a workout reminder', "What's on my plate?"]);
    expect(chatProps?.chips.every((c) => c.prompt.length > 0)).toBe(true);
  });
  it('share switch posts to the server and flips only after success', async () => {
    renderPage();
    const sw = await screen.findByRole('switch', { name: /share private diary with clio this session/i });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
    expect(apiFetch).toHaveBeenCalledWith('/api/session/share', { method: 'POST', json: { on: true } });
  });
  it('keeps the old share state and shows an error when the toggle fails', async () => {
    apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/session/share' && init?.method === 'POST') throw new Error('nope');
      if (path === '/api/session/share') return { on: false };
      if (path === '/api/settings') return { timezone: 'UTC' };
      return { ok: true };
    });
    renderPage();
    const sw = await screen.findByRole('switch', { name: /share private diary/i });
    await userEvent.click(sw);
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update sharing/i);
    expect(sw).not.toBeChecked();
  });
  it('falls back to UTC when settings returns an invalid timezone', async () => {
    window.history.replaceState(null, '', '/?checkin=1');
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/settings') return { timezone: 'Not/AZone' };
      if (path === '/api/session/share') return { on: false };
      return { ok: true };
    });
    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: 'Mood 2' }));
    await userEvent.click(screen.getByRole('button', { name: /save check-in/i }));
    await waitFor(() => expect(entryCalls()).toHaveLength(1));
    expect(entryCalls()[0][0]).toContain(`/api/daily/${todayIn('UTC')}/entries`);
  });
  it('opens quick note in a sheet and closes it after a successful save', async () => {
    vi.mocked(saveNote).mockResolvedValue(undefined as never);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '+ Note' }));
    const dialog = screen.getByRole('dialog', { name: 'Quick note' });
    expect(dialog).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title'), 't');
    await userEvent.type(screen.getByLabelText('Note'), 'b');
    await userEvent.click(screen.getByRole('button', { name: /save note/i }));
    await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ title: 't', body: 'b' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('keeps the sheet open when saving fails', async () => {
    vi.mocked(saveNote).mockRejectedValue(new Error('x'));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: '+ Note' }));
    await userEvent.type(screen.getByLabelText('Title'), 't');
    await userEvent.type(screen.getByLabelText('Note'), 'b');
    await userEvent.click(screen.getByRole('button', { name: /save note/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save/i);
    expect(screen.getByRole('dialog', { name: 'Quick note' })).toBeInTheDocument();
  });
});
