import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../pages/SettingsPage';

const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));

const settings = { openrouterKeySet: true, openrouterModel: 'openai/gpt-4o-mini', timezone: 'Asia/Manila', checkinTimes: { morning: '09:00', evening: '20:30' } };
beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/settings') return settings;
    if (path === '/api/settings/test-key') return { ok: false, error: 'openrouter_401' };
    return {};
  });
});

describe('SettingsPage', () => {
  it('shows that a key is saved without ever showing the key, and reports a failed key test', async () => {
    render(<SettingsPage />);
    expect(await screen.findByText(/key saved/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/openrouter api key/i) as HTMLInputElement).value).toBe('');
    await userEvent.click(screen.getByRole('button', { name: /test key/i }));
    expect(await screen.findByText(/openrouter_401/)).toBeInTheDocument();
  });
  it('saves changed check-in times with the timezone', async () => {
    render(<SettingsPage />);
    const morning = await screen.findByLabelText(/morning reminder/i);
    await userEvent.clear(morning);
    await userEvent.type(morning, '07:30');
    await userEvent.click(screen.getByRole('button', { name: /save check-in settings/i }));
    const put = apiFetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[1].json).toEqual({ timezone: 'Asia/Manila', checkinTimes: { morning: '07:30', evening: '20:30' } });
  });
  it('the AI panel saves only the key and model', async () => {
    render(<SettingsPage />);
    await userEvent.type(await screen.findByLabelText(/openrouter api key/i), 'sk-or-new');
    await userEvent.click(screen.getByRole('button', { name: /save ai settings/i }));
    const put = apiFetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[1].json).toEqual({ openrouterModel: 'openai/gpt-4o-mini', openrouterKey: 'sk-or-new' });
  });
  it('shows the AI and check-in panels only (backup has its own page; the numdum import is gone)', async () => {
    render(<SettingsPage />);
    await screen.findByText(/key saved/i);
    expect(screen.getByRole('region', { name: 'AI (OpenRouter)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Daily check-ins' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /backup/i })).toBeNull();
    expect(screen.queryByText(/numdum/i)).toBeNull();
  });
});
