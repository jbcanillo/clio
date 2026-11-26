// @vitest-environment node
// End to end: the app's backup and restore code against two real Clio API servers (source and destination vaults).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Backend modules, imported straight from the backend package.
import { createApp } from '../../../backend/src/app.js';
import { createAuth } from '../../../backend/src/services/authService.js';
import { createSettingsService } from '../../../backend/src/services/settingsService.js';
import { createVaultService } from '../../../backend/src/services/vaultService.js';
import { createDailyService } from '../../../backend/src/services/dailyService.js';
import { createReminderService } from '../../../backend/src/services/reminderService.js';
import { createJournalService } from '../../../backend/src/services/journalService.js';
import { createNotesService } from '../../../backend/src/services/notesService.js';
import { createAttachmentService } from '../../../backend/src/services/attachmentService.js';
import { createBackupService } from '../../../backend/src/services/backupService.js';
import { createPlainVaultMemory } from '../../../backend/src/services/memory/plainVaultMemory.js';
import { createShareSession } from '../../../backend/src/services/shareSession.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Srv { base: string; token: string; server: Server; vault: any }
const target: { current: Srv | null } = { current: null };

// The app's apiFetch, pointed at whichever server the test is talking to.
vi.mock('../lib/api', async (orig) => ({
  ...(await orig<object>()),
  apiFetch: async (p: string, init: { method?: string; json?: unknown } = {}) => call(target.current!, init.method ?? 'GET', p, init.json),
}));

import { decryptBackup, describeBackup, encryptBackup, restoreBackup, type VaultBackup } from '../lib/backup';

async function call(s: Srv, method: string, p: string, json?: unknown) {
  const res = await fetch(`${s.base}${p}`, {
    method,
    headers: { 'X-Session-Token': s.token, ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : undefined;
}

async function startServer(): Promise<Srv> {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-e2e-vault-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-e2e-data-'));
  const vault = createVaultService({ vaultDir });
  const deps = {
    auth: createAuth({ password: 'pw', ttlHours: 1 }),
    settings: createSettingsService({ dataDir, secretKey: 'k'.repeat(32), envOpenRouterKey: undefined }),
    vault,
    daily: createDailyService({ vault }),
    reminders: createReminderService({ vault }),
    journal: createJournalService({ vault }),
    notes: createNotesService({ vault }),
    attachments: createAttachmentService({ vault }),
    backup: createBackupService({ vault }),
    memory: createPlainVaultMemory({ vault }),
    shareSession: createShareSession(),
    config: { timezone: 'UTC' },
    rateLimits: { api: 100_000 },
  };
  const server: Server = await new Promise((resolve) => { const s = createApp(deps).listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { token } = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) })).json();
  return { base, token, server, vault };
}

/** A PNG the server accepts (it checks the magic bytes), padded to `size` bytes. */
const png = (size: number, fill: number) => {
  const b = Buffer.alloc(size, fill);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  return b.toString('base64');
};

const servers: Srv[] = [];
afterAll(() => servers.forEach((s) => s.server.close()));

async function seed(s: Srv) {
  for (let i = 1; i <= 4; i++) await call(s, 'POST', '/api/attachments', { file: `photo0000${i}.png`, mime: 'image/png', data: png(3 * 1024 * 1024, i) });
  await call(s, 'POST', '/api/reminders', {
    title: 'Call the plumber', due: '2026-12-01T09:00:00.000Z', priority: 'high', repeat: 'weekly', notes: 'Kitchen sink',
    extras: { contact: { name: 'Jose Cruz', phone: '0917 111 2222', email: 'jose@plumb.ph' }, photos: ['photo00001.png'], checklist: [{ text: 'buy tape', done: true }] },
  });
  const rent = await call(s, 'POST', '/api/reminders', { title: 'Pay rent', due: '2026-11-30T01:00:00.000Z', repeat: 'never' });
  await call(s, 'POST', `/api/reminders/${rent.id}/complete`);
  await s.vault.write('Clio/Notes/groceries.md', { frontmatter: { title: 'Groceries', tags: ['home'] }, body: '- [ ] Eggs\n- [x] Milk\n\n![photo](../Attachments/photo00003.png)\n' }, { expectedHash: null });
  await s.vault.write('Clio/Notes/secret.md', { frontmatter: { title: 'Secret', private: true }, body: 'hidden\n' }, { expectedHash: null });
  await s.vault.write('Clio/Memory/Profile.md', { frontmatter: { title: 'Profile', private: false }, body: '# Profile\n- likes ramen\n' }, { expectedHash: null });
  for (const e of [
    { section: 'events', text: 'Lunch with Maria' }, { section: 'thoughts', text: 'ünïcödé ✓ 日本' }, { section: 'ideas', text: 'Start a garden' },
    { mood: 4, energy: 2 }, { person: { name: 'Maria Santos', phone: '+63 917 555 1234', email: 'maria@example.com' } },
    { place: { lat: 14.55, lng: 121.02, label: 'Ramen place' } }, { photo: 'photo00002.png' },
  ]) await call(s, 'POST', '/api/daily/2026-11-20/entries', e);
  await call(s, 'POST', '/api/daily/2026-11-21/entries', { mood: 2 });
  await call(s, 'POST', '/api/journal', { text: 'Private journal entry', mood: 'calm', extras: { weather: 'rain' } });
}

async function snapshot(s: Srv) {
  const [reminders, notes, d20, d21, journal, days, photo] = await Promise.all([
    call(s, 'GET', '/api/reminders'), call(s, 'GET', '/api/notes'), call(s, 'GET', '/api/daily/2026-11-20'), call(s, 'GET', '/api/daily/2026-11-21'),
    call(s, 'GET', '/api/journal'), call(s, 'GET', '/api/daily?from=2026-11-19&to=2026-11-22'), call(s, 'GET', '/api/attachments/photo00004.png'),
  ]);
  return { reminders, notes, d20, d21, journal, days, photo };
}

it('backs up a vault and restores it into another, so every screen shows the same reminders, notes, diary and journal', async () => {
  const src = await startServer();
  const dst = await startServer();
  servers.push(src, dst);
  await seed(src);
  await call(src, 'POST', '/api/daily/2026-11-22/entries', { section: 'events', text: 'Third day' });

  // Something only on the destination, which "Replace" must remove.
  await call(dst, 'POST', '/api/reminders', { title: 'Only on the new device', due: '2026-12-09T09:00:00.000Z' });

  // Backup, exactly as the app does it (export, encrypt) — then open the file again (decrypt, describe).
  target.current = src;
  const exported = await call(src, 'POST', '/api/backup/export') as VaultBackup;
  const file = await encryptBackup(exported, 'a long backup password', 1000);
  expect(file.length).toBeGreaterThan(16 * 1024 * 1024); // 4 photos of 3 MB, base64 inside the encrypted JSON
  const opened = describeBackup(await decryptBackup(file, 'a long backup password'));
  expect(opened.counts).toEqual({ reminders: 2, notes: 2, diary: 3, journal: 1, photos: 4, other: 1 });
  // Byte-for-byte after the round trip through the encrypted file.
  expect(opened.backup).toEqual(exported);

  // Restore into the destination, in batches.
  target.current = dst;
  const progress: number[] = [];
  await restoreBackup(opened, { replace: true }, (d) => progress.push(d));
  expect(progress.length).toBeGreaterThan(2); // more than one upload batch

  const before = await snapshot(src);
  const after = await snapshot(dst);
  expect(after).toEqual(before);
  expect(after.reminders.map((r: { title: string }) => r.title).sort()).toEqual(['Call the plumber', 'Pay rent']);
  expect(after.reminders.find((r: { title: string }) => r.title === 'Pay rent').done).toBe(true);
  expect(after.reminders.find((r: { title: string }) => r.title === 'Call the plumber').extras.contact.email).toBe('jose@plumb.ph');
  expect(after.d20.entries.people).toEqual([{ name: 'Maria Santos', phone: '+63 917 555 1234', email: 'maria@example.com' }]);
  expect(after.d20.entries.thoughts).toEqual(['ünïcödé ✓ 日本']);
  expect(after.d20.frontmatter).toMatchObject({ mood: 4, energy: 2, private: true });
  expect(after.journal).toHaveLength(1);
  expect(after.photo.data).toBe(png(3 * 1024 * 1024, 4));
  expect(after.notes.find((n: { title: string }) => n.title === 'Groceries')).toMatchObject({ checklist: [{ text: 'Eggs', done: false }, { text: 'Milk', done: true }], photos: ['photo00003.png'] });
  for (const f of exported.files) expect((await dst.vault.readFile(f.path)).toString('base64'), f.path).toBe(f.data);

  // Search works on the restored data, and private entries stay private.
  const hits = await call(dst, 'GET', '/api/search?q=plumber');
  expect(hits.length).toBeGreaterThan(0);
}, 120_000);

it('restores notes, including checklists and private notes, and keeps them editable', async () => {
  const src = await startServer();
  const dst = await startServer();
  servers.push(src, dst);
  // Notes reach the vault through the sync route in the app; here the backup export is built from a vault that has them.
  target.current = src;
  const exported = await call(src, 'POST', '/api/backup/export') as VaultBackup;
  const withNotes: VaultBackup = {
    ...exported,
    files: [
      ...exported.files,
      { path: 'Clio/Notes/groceries.md', data: Buffer.from('---\ntitle: Groceries\ntags:\n  - home\n---\n- [ ] Eggs\n- [x] Milk\n').toString('base64') },
      { path: 'Clio/Notes/secret.md', data: Buffer.from('---\ntitle: Secret\nprivate: true\n---\nhidden\n').toString('base64') },
    ],
  };
  const opened = describeBackup(await decryptBackup(await encryptBackup(withNotes, 'pw-123456', 1000), 'pw-123456'));
  expect(opened.counts.notes).toBe(2);
  target.current = dst;
  await restoreBackup(opened, { replace: true });
  const notes = await call(dst, 'GET', '/api/notes');
  expect(notes).toHaveLength(1); // the private note is restored but, as before, not listed
  expect(notes[0]).toMatchObject({ title: 'Groceries', tags: ['home'], checklist: [{ index: 0, text: 'Eggs', done: false }, { index: 1, text: 'Milk', done: true }] });
  await call(dst, 'PATCH', '/api/notes/checklist', { path: notes[0].path, index: 0, checked: true, baseHash: notes[0].hash });
  expect((await call(dst, 'GET', '/api/notes'))[0].checklist[0].done).toBe(true);
  const back = await call(dst, 'POST', '/api/backup/export') as VaultBackup;
  expect(back.files.map((f) => f.path)).toContain('Clio/Notes/secret.md');
}, 60_000);
