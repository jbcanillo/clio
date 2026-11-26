import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupRestore, describeCounts } from '../components/features/BackupRestore';
import type { VaultBackup } from '../lib/backup';

const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));

const backup: VaultBackup = {
  format: 'clio-backup', version: 2, exportedAt: '2026-11-26T10:00:00.000Z',
  counts: { reminders: 2, notes: 1, diary: 1, journal: 0, photos: 1, other: 0 },
  files: [
    { path: 'Clio/Reminders/a.md', data: btoa('a') },
    { path: 'Clio/Reminders/b.md', data: btoa('b') },
    { path: 'Clio/Notes/n.md', data: btoa('n') },
    { path: 'Clio/Daily/2026-11-20.md', data: btoa('d') },
    { path: 'Clio/Attachments/photo00001.png', data: 'iVBORw0KGgo=' },
  ],
};

let downloaded: Blob | null = null;
const g = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
beforeAll(() => {
  g.createObjectURL = (b) => { downloaded = b; return 'blob:x'; };
  g.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (p: string) => (p === '/api/backup/export' ? backup : {}));
});

describe('describeCounts', () => {
  it('lists only what there is, with singular and plural', () => {
    expect(describeCounts({ reminders: 1, notes: 0, diary: 3, journal: 2, photos: 0, other: 0 })).toBe('1 reminder, 3 diary days, 2 journal entries');
    expect(describeCounts({ reminders: 0, notes: 0, diary: 0, journal: 0, photos: 0, other: 0 })).toBe('nothing yet');
  });
});

describe('BackupRestore', () => {
  it('checks the backup password: long enough and typed twice the same', async () => {
    render(<BackupRestore />);
    await userEvent.type(screen.getByLabelText('Backup password', { selector: 'input[autocomplete="new-password"]' }), 'short');
    await userEvent.click(screen.getByRole('button', { name: /download backup/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 8/i);
    await userEvent.type(screen.getByLabelText('Backup password', { selector: 'input[autocomplete="new-password"]' }), '-enough');
    await userEvent.type(screen.getByLabelText(/repeat the password/i), 'different!');
    await userEvent.click(screen.getByRole('button', { name: /download backup/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/don't match/i);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('downloads a backup, then restores that same file after showing what it holds', async () => {
    const onToast = vi.fn();
    render(<BackupRestore onToast={onToast} />);
    await userEvent.type(screen.getByLabelText('Backup password', { selector: 'input[autocomplete="new-password"]' }), 'my secret pw');
    await userEvent.type(screen.getByLabelText(/repeat the password/i), 'my secret pw');
    await userEvent.click(screen.getByRole('button', { name: /download backup/i }));
    expect(await screen.findByText(/backup downloaded: 2 reminders, 1 note, 1 diary day, 1 photo/i, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(onToast).toHaveBeenCalledWith('Backup downloaded', 'success');

    // Restore: pick the downloaded file, try a wrong password first.
    const file = new File([downloaded!], 'clio-backup-2026-11-26.enc');
    await userEvent.upload(document.getElementById('backup-file-input') as HTMLInputElement, file);
    expect(screen.getByText('clio-backup-2026-11-26.enc')).toBeInTheDocument();
    const restorePw = screen.getByLabelText('Backup password', { selector: 'input[autocomplete="off"]' });
    await userEvent.type(restorePw, 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: /open backup/i }));
    expect(await screen.findByRole('alert', {}, { timeout: 10_000 })).toHaveTextContent(/wrong password/i);

    await userEvent.clear(restorePw);
    await userEvent.type(restorePw, 'my secret pw');
    await userEvent.click(screen.getByRole('button', { name: /open backup/i }));
    const group = await screen.findByRole('group', { name: /restore/i });
    expect(await within(group).findByText(/2 reminders, 1 note, 1 diary day, 1 photo/, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(apiFetch.mock.calls.filter(([p]) => p.startsWith('/api/backup/restore'))).toHaveLength(0); // nothing changed yet

    // Merge instead of replace.
    await userEvent.click(screen.getByRole('radio', { name: /merge/i }));
    await userEvent.click(screen.getByRole('button', { name: /merge backup/i }));
    expect(await screen.findByText(/restored 2 reminders/i)).toBeInTheDocument();
    const finish = apiFetch.mock.calls.find(([p]) => p === '/api/backup/restore/finish');
    expect(finish?.[1].json).toEqual({ keep: backup.files.map((f) => f.path), prune: false });
    expect(onToast).toHaveBeenCalledWith('Restore complete', 'success');
  }, 30_000);

  it('shows a clear error when the server cannot be reached', async () => {
    apiFetch.mockRejectedValue(new Error('Failed to fetch'));
    render(<BackupRestore />);
    await userEvent.type(screen.getByLabelText('Backup password', { selector: 'input[autocomplete="new-password"]' }), 'my secret pw');
    await userEvent.type(screen.getByLabelText(/repeat the password/i), 'my secret pw');
    await userEvent.click(screen.getByRole('button', { name: /download backup/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Backup failed: Failed to fetch');
  });
});
