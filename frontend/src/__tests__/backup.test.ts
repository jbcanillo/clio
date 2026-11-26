import * as CryptoJS from 'crypto-js';
import { DATA_CHANGED_EVENT } from '../lib/dataEvents';

const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));
const store = vi.hoisted(() => ({
  createReminder: vi.fn(async (r: { title: string }) => ({ ...r, id: `new-${r.title}` })),
  updateReminder: vi.fn(async (r: unknown) => r),
  deleteAllReminders: vi.fn(async () => {}),
  createJournalEntry: vi.fn(async (j: unknown) => j),
  deleteAllJournalEntries: vi.fn(async () => {}),
}));
vi.mock('../utils/store', () => ({
  default: { createReminder: store.createReminder, updateReminder: store.updateReminder, deleteAllReminders: store.deleteAllReminders },
  createJournalEntry: store.createJournalEntry,
  deleteAllJournalEntries: store.deleteAllJournalEntries,
}));

import {
  BackupError, batchFiles, countFiles, createBackup, decryptBackup, describeBackup, encryptBackup, openBackupFile, restoreBackup,
  type VaultBackup,
} from '../lib/backup';

const FAST = 1000; // PBKDF2 rounds for tests; real backups use 600,000
const exportFixture = (): VaultBackup => ({
  format: 'clio-backup', version: 2, exportedAt: '2026-11-26T10:00:00.000Z',
  counts: { reminders: 1, notes: 1, diary: 1, journal: 1, photos: 1, other: 1 },
  files: [
    { path: 'Clio/Reminders/abc.md', data: btoa('---\nid: abc\n---\n') },
    { path: 'Clio/Notes/groceries.md', data: btoa('- [ ] eggs\n') },
    { path: 'Clio/Daily/2026-11-20.md', data: btoa('## People\n- Maria · 0917 · maria@example.com\n') },
    { path: 'Clio/Events/2026-11-20-j1.md', data: btoa('journal') },
    { path: 'Clio/Attachments/photo00001.png', data: 'iVBORw0KGgo=' },
    { path: 'Clio/Memory/Profile.md', data: btoa('# Profile') },
  ],
});

beforeEach(() => {
  apiFetch.mockReset();
  Object.values(store).forEach((f) => f.mockClear());
});

describe('backup file encryption', () => {
  it('round-trips, including non-ASCII text', async () => {
    const value = { hello: 'ünïcödé ✓ 日本', n: [1, 2, 3] };
    const bytes = await encryptBackup(value, 'correct horse', FAST);
    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('CLIOBAK2');
    expect(new TextDecoder().decode(bytes)).not.toContain('hello'); // nothing in the clear
    expect(await decryptBackup(bytes, 'correct horse')).toEqual(value);
  });

  it('uses a fresh salt and iv every time', async () => {
    const a = await encryptBackup({ x: 1 }, 'pw-12345', FAST);
    const b = await encryptBackup({ x: 1 }, 'pw-12345', FAST);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('rejects a wrong password and a tampered file', async () => {
    const bytes = await encryptBackup({ x: 1 }, 'right-password', FAST);
    await expect(decryptBackup(bytes, 'wrong-password')).rejects.toThrow(/wrong password/i);
    const tampered = bytes.slice();
    tampered[tampered.length - 1] ^= 1;
    await expect(decryptBackup(tampered, 'right-password')).rejects.toThrow(/wrong password/i);
    await expect(decryptBackup(bytes, '')).rejects.toThrow(BackupError);
  });

  it('still opens backups from the old version (CryptoJS text with reminders and journal)', async () => {
    const old = { version: 1, exportedAt: '2026-03-28T12:00:00Z', reminders: [{ id: '1', title: 'Old', completed: true }], journal: [{ id: 'j1', text: 'hi' }] };
    const file = new TextEncoder().encode(CryptoJS.AES.encrypt(JSON.stringify(old), 'oldpass').toString());
    const opened = describeBackup(await decryptBackup(file, 'oldpass'));
    expect(opened).toMatchObject({ kind: 'legacy', exportedAt: '2026-03-28T12:00:00Z', counts: { reminders: 1, journal: 1, notes: 0 } });
    await expect(decryptBackup(file, 'nope')).rejects.toThrow(/wrong password/i);
  });

  it('refuses files that are not Clio backups', async () => {
    await expect(decryptBackup(new TextEncoder().encode('just some text'), 'pw')).rejects.toThrow(/not a clio backup/i);
    expect(() => describeBackup({ some: 'json' })).toThrow(/not a clio backup/i);
    expect(() => describeBackup({ format: 'clio-backup', version: 3, files: [] })).toThrow(/newer or unknown/i);
    expect(() => describeBackup({ format: 'clio-backup', version: 2, files: [{ path: '/etc/passwd', data: '' }] })).toThrow(/newer or unknown/i);
  });

  it('opens a backup file chosen in the browser', async () => {
    const bytes = await encryptBackup(exportFixture(), 'pw-12345', FAST);
    const opened = await openBackupFile(new Blob([bytes as BlobPart]), 'pw-12345');
    expect(opened.kind).toBe('vault');
    expect(opened.counts).toEqual({ reminders: 1, notes: 1, diary: 1, journal: 1, photos: 1, other: 1 });
  });
});

describe('counting and batching', () => {
  it('counts files by the area they belong to', () => {
    expect(countFiles(exportFixture().files)).toEqual({ reminders: 1, notes: 1, diary: 1, journal: 1, photos: 1, other: 1 });
  });

  it('splits uploads by size and by count, keeping order and every file', () => {
    const files = Array.from({ length: 7 }, (_, i) => ({ path: `Clio/Notes/${i}.md`, data: 'x'.repeat(40) }));
    const bySize = batchFiles(files, 120, 500); // each file is 40 chars of data + a 14-char path
    expect(bySize.map((b) => b.length)).toEqual([2, 2, 2, 1]);
    expect(bySize.flat()).toEqual(files);
    expect(batchFiles(files, 1e9, 3).map((b) => b.length)).toEqual([3, 3, 1]);
    // A single file over the size budget still goes, alone.
    expect(batchFiles([{ path: 'Clio/Attachments/big.png', data: 'x'.repeat(500) }], 100).length).toBe(1);
  });
});

describe('createBackup', () => {
  it('fetches the export with POST (never cached) and downloads it encrypted', async () => {
    const backup = exportFixture();
    apiFetch.mockResolvedValue(backup);
    let blob: Blob | null = null;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('clio-backup-2026-11-26.enc');
    });
    const g = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    const prev = [g.createObjectURL, g.revokeObjectURL];
    g.createObjectURL = (b) => { blob = b; return 'blob:x'; };
    g.revokeObjectURL = () => {};
    try {
      const counts = await createBackup('pw-12345', { iterations: FAST, now: new Date('2026-11-26T12:00:00Z') });
      expect(counts.diary).toBe(1);
      expect(apiFetch).toHaveBeenCalledWith('/api/backup/export', { method: 'POST' });
      expect(click).toHaveBeenCalled();
      expect((await openBackupFile(blob!, 'pw-12345')).backup).toEqual(backup);
    } finally {
      g.createObjectURL = prev[0] as typeof g.createObjectURL;
      g.revokeObjectURL = prev[1] as typeof g.revokeObjectURL;
      click.mockRestore();
    }
  });
});

describe('restoreBackup', () => {
  it('uploads every file in batches, then finishes with the full list and the chosen mode', async () => {
    apiFetch.mockResolvedValue({});
    const changed = vi.fn();
    window.addEventListener(DATA_CHANGED_EVENT, changed);
    const opened = describeBackup(exportFixture());
    const progress: number[] = [];
    await restoreBackup(opened, { replace: true }, (d) => progress.push(d));
    window.removeEventListener(DATA_CHANGED_EVENT, changed);

    const uploads = apiFetch.mock.calls.filter(([p]) => p === '/api/backup/restore/files');
    expect(uploads.flatMap(([, init]) => init.json.files)).toEqual(exportFixture().files);
    const finish = apiFetch.mock.calls[apiFetch.mock.calls.length - 1];
    expect(finish).toEqual(['/api/backup/restore/finish', { method: 'POST', json: { keep: exportFixture().files.map((f) => f.path), prune: true } }]);
    expect(progress[progress.length - 1]).toBe(6);
    expect(changed).toHaveBeenCalled();
  });

  it('merge mode does not prune', async () => {
    apiFetch.mockResolvedValue({});
    await restoreBackup(describeBackup(exportFixture()), { replace: false });
    expect(apiFetch.mock.calls[apiFetch.mock.calls.length - 1][1].json.prune).toBe(false);
  });

  it('stops at a failed batch without finishing (so nothing is removed)', async () => {
    apiFetch.mockRejectedValueOnce(new Error('network'));
    await expect(restoreBackup(describeBackup(exportFixture()), { replace: true })).rejects.toThrow('network');
    expect(apiFetch.mock.calls.some(([p]) => p === '/api/backup/restore/finish')).toBe(false);
  });

  it('restores an old backup: replaces reminders and journal, and keeps completed reminders completed', async () => {
    const opened = describeBackup({ version: 1, reminders: [{ title: 'A', completed: true }, { title: 'B', completed: false }], journal: [{ text: 'j' }] });
    await restoreBackup(opened, { replace: true });
    expect(store.deleteAllReminders).toHaveBeenCalled();
    expect(store.deleteAllJournalEntries).toHaveBeenCalled();
    expect(store.createReminder).toHaveBeenCalledTimes(2);
    expect(store.updateReminder).toHaveBeenCalledWith({ title: 'A', completed: true, id: 'new-A' });
    expect(store.updateReminder).toHaveBeenCalledTimes(1);
    expect(store.createJournalEntry).toHaveBeenCalledWith({ text: 'j' });
  });

  it('refuses to start offline', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      await expect(restoreBackup(describeBackup(exportFixture()), { replace: true })).rejects.toThrow(/offline/i);
      expect(apiFetch).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
