import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportLegacy } from '../components/features/ImportLegacy';

const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));
const legacy = { reminders: [{ id: 1, title: 'R' }], journals: [{ id: 'j', text: 'T' }] };
vi.mock('../utils/db', () => ({
  default: { getAllReminders: async () => legacy.reminders },
  getAllJournalEntries: async () => legacy.journals,
}));

beforeEach(() => { apiFetch.mockReset(); legacy.reminders = [{ id: 1, title: 'R' }]; legacy.journals = [{ id: 'j', text: 'T' }]; });

describe('ImportLegacy', () => {
  it('reads the old browser data, posts it to the server and reports the result', async () => {
    apiFetch.mockResolvedValue({ reminders: 1, journals: 1, skipped: 0, dropped: 0 });
    render(<ImportLegacy />);
    await userEvent.click(screen.getByRole('button', { name: /import/i }));
    expect(apiFetch).toHaveBeenCalledWith('/api/import/numdum', { method: 'POST', json: { reminders: legacy.reminders, journals: legacy.journals } });
    expect(await screen.findByRole('status')).toHaveTextContent('Imported 1 reminders and 1 journal entries');
  });
  it('says so when there is nothing to import and does not call the server', async () => {
    legacy.reminders = [];
    legacy.journals = [];
    render(<ImportLegacy />);
    await userEvent.click(screen.getByRole('button', { name: /import/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/nothing to import/i);
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it('mentions skipped and dropped items, and shows an error when the server fails', async () => {
    apiFetch.mockResolvedValueOnce({ reminders: 1, journals: 0, skipped: 2, dropped: 1 });
    render(<ImportLegacy />);
    await userEvent.click(screen.getByRole('button', { name: /import/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/2 skipped.*1 large/i);
    apiFetch.mockRejectedValueOnce(new Error('x'));
    await userEvent.click(screen.getByRole('button', { name: /import/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
