import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChatPage from '../pages/ChatPage';

const appendMessage = vi.fn();
vi.mock('@copilotkit/react-ui', () => ({ CopilotChat: () => <div data-testid="chat" /> }));
vi.mock('@copilotkit/react-ui/styles.css', () => ({}));
vi.mock('@copilotkit/react-core', async (orig) => ({ ...(await orig<object>()), useCopilotChat: () => ({ appendMessage }) }));
vi.mock('../copilot/actions', async (orig) => ({ ...(await orig<object>()), ClioActions: () => null }));
vi.mock('../offline', () => ({ outbox: { flush: async () => ({ sent: 0, conflicts: [], failed: 0, locked: false }), pending: async () => 0 }, saveNote: vi.fn() }));
const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));

beforeEach(() => {
  apiFetch.mockReset();
  appendMessage.mockReset();
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
    await waitFor(() => expect(appendMessage).toHaveBeenCalledTimes(1));
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
