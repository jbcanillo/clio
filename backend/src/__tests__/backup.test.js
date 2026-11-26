import request from 'supertest';
import { makeApi } from './helpers/api.js';
import { createAttachmentService } from '../services/attachmentService.js';
import { createBackupService, checkBackupPath } from '../services/backupService.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** An app over its own temp vault, with backup and attachments wired in. */
async function api() {
  const holder = {};
  const a = await makeApi({
    attachments: { put: (x) => holder.att.put(x), get: (f) => holder.att.get(f) },
    backup: { exportAll: () => holder.b.exportAll(), writeFiles: (f) => holder.b.writeFiles(f), prune: (k) => holder.b.prune(k) },
  });
  holder.att = createAttachmentService({ vault: a.h.vault });
  holder.b = createBackupService({ vault: a.h.vault });
  return a;
}

/** Puts one of everything Clio stores into the vault, through the same routes the app uses. */
async function seed({ as, h }) {
  await as('post', '/api/attachments').send({ file: 'photo00001.png', mime: 'image/png', data: PNG.toString('base64') });
  const r1 = await as('post', '/api/reminders').send({
    title: 'Call the plumber', due: '2026-12-01T09:00:00.000Z', priority: 'high', repeat: 'weekly', notes: 'Kitchen sink',
    extras: { contact: { name: 'Jose Cruz', phone: '0917 111 2222', email: 'jose@plumb.ph' }, location: { lat: 14.6, lng: 121, label: 'Home' }, photos: ['photo00001.png'] },
  });
  const r2 = await as('post', '/api/reminders').send({ title: 'Pay rent', due: '2026-11-30T01:00:00.000Z' });
  await as('post', `/api/reminders/${r2.body.id}/complete`);
  await as('post', '/api/daily/2026-11-20/entries').send({ section: 'events', text: 'Lunch with Maria' });
  await as('post', '/api/daily/2026-11-20/entries').send({ section: 'thoughts', text: 'Feeling good — ünïcödé ✓' });
  await as('post', '/api/daily/2026-11-20/entries').send({ mood: 4, energy: 3 });
  await as('post', '/api/daily/2026-11-20/entries').send({ person: { name: 'Maria Santos', phone: '+63 917 555 1234', email: 'maria@example.com' } });
  await as('post', '/api/daily/2026-11-20/entries').send({ place: { lat: 14.55, lng: 121.02, label: 'Ramen place' } });
  await as('post', '/api/daily/2026-11-20/entries').send({ photo: 'photo00001.png' });
  await as('post', '/api/journal').send({ text: 'A private journal entry', mood: 'happy', extras: { weather: 'sunny' } });
  await h.vault.write('Clio/Notes/groceries.md', { frontmatter: { title: 'Groceries', tags: ['home'] }, body: '- [ ] Eggs\n- [x] Milk\n\n![photo](../Attachments/photo00001.png)\n' }, { expectedHash: null });
  await h.vault.write('Clio/Notes/secret.md', { frontmatter: { title: 'Secret', private: true }, body: 'hidden from the list, still backed up\n' }, { expectedHash: null });
  await h.vault.write('Clio/Memory/Profile.md', { frontmatter: { title: 'Profile', private: false }, body: '# Profile\n- likes ramen\n' }, { expectedHash: null });
  return { reminderId: r1.body.id };
}

/** Everything the app can show, as the API returns it. */
async function snapshot(as) {
  const [reminders, notes, day, journal, photo, summaries] = await Promise.all([
    as('get', '/api/reminders'), as('get', '/api/notes'), as('get', '/api/daily/2026-11-20'),
    as('get', '/api/journal'), as('get', '/api/attachments/photo00001.png'), as('get', '/api/daily?from=2026-11-20&to=2026-11-20'),
  ]);
  return { reminders: reminders.body, notes: notes.body, day: day.body, journal: journal.body, photo: photo.body, summaries: summaries.body };
}

/** Restores an export the way the app does: batches of files, then finish. */
async function restore(as, backup, { prune = true, batch = 3 } = {}) {
  for (let i = 0; i < backup.files.length; i += batch) {
    const res = await as('post', '/api/backup/restore/files').send({ files: backup.files.slice(i, i + batch) });
    expect(res.status).toBe(200);
  }
  return as('post', '/api/backup/restore/finish').send({ keep: backup.files.map((f) => f.path), prune });
}

describe('backup and restore', () => {
  it('requires a token', async () => {
    const { app } = await api();
    expect((await request(app).post('/api/backup/export')).status).toBe(401);
    expect((await request(app).post('/api/backup/restore/files').send({ files: [] })).status).toBe(401);
    expect((await request(app).post('/api/backup/restore/finish').send({ keep: [], prune: true })).status).toBe(401);
  });

  it('exports every reminder, note, diary day, journal entry, photo and the profile, and is never cached', async () => {
    const a = await api();
    await seed(a);
    const res = await a.as('post', '/api/backup/export');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ format: 'clio-backup', version: 2, counts: { reminders: 2, notes: 2, diary: 1, journal: 1, photos: 1, other: 1 } });
    const paths = res.body.files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['Clio/Attachments/photo00001.png', 'Clio/Daily/2026-11-20.md', 'Clio/Notes/groceries.md', 'Clio/Notes/secret.md', 'Clio/Memory/Profile.md']));
    expect(Buffer.from(res.body.files.find((f) => f.path.endsWith('.png')).data, 'base64')).toEqual(PNG);
  });

  it('restores into an empty vault so every screen shows exactly the same data', async () => {
    const src = await api();
    await seed(src);
    const before = await snapshot(src.as);
    const backup = (await src.as('post', '/api/backup/export')).body;

    const dst = await api();
    const done = await restore(dst.as, backup);
    expect(done.status).toBe(200);
    const after = await snapshot(dst.as);
    expect(after).toEqual(before);

    // Byte-for-byte, including files no screen lists (private notes, the profile).
    for (const f of backup.files) expect((await dst.h.vault.readFile(f.path)).toString('base64'), f.path).toBe(f.data);
    // Spot checks on the details that matter most.
    expect(after.reminders.find((r) => r.title === 'Call the plumber').extras.contact).toEqual({ name: 'Jose Cruz', phone: '0917 111 2222', email: 'jose@plumb.ph' });
    expect(after.day.entries.people).toEqual([{ name: 'Maria Santos', phone: '+63 917 555 1234', email: 'maria@example.com' }]);
    expect(after.day.frontmatter).toMatchObject({ mood: 4, energy: 3, private: true });
    expect(after.journal[0]).toMatchObject({ text: 'A private journal entry', mood: 'happy', extras: { weather: 'sunny' } });
    expect(after.notes.find((n) => n.title === 'Groceries').checklist).toEqual([{ index: 0, text: 'Eggs', done: false }, { index: 1, text: 'Milk', done: true }]);
  });

  it('restored data stays editable: hashes match, so the next edit is not a conflict', async () => {
    const src = await api();
    const { reminderId } = await seed(src);
    const backup = (await src.as('post', '/api/backup/export')).body;
    const dst = await api();
    await restore(dst.as, backup);
    const note = (await dst.as('get', '/api/notes')).body.find((n) => n.title === 'Groceries');
    expect((await dst.as('patch', '/api/notes/checklist').send({ path: note.path, index: 0, checked: true, baseHash: note.hash })).status).toBe(200);
    expect((await dst.as('post', `/api/reminders/${reminderId}/complete`)).status).toBe(200);
    expect((await dst.as('post', '/api/daily/2026-11-20/entries').send({ section: 'ideas', text: 'after restore' })).status).toBe(201);
  });

  it('replace mode removes what the backup did not have (but never photos); merge mode keeps it', async () => {
    const src = await api();
    await seed(src);
    const backup = (await src.as('post', '/api/backup/export')).body;

    const dst = await api();
    await dst.as('post', '/api/reminders').send({ title: 'Only on this device', due: '2026-12-05T09:00:00.000Z' });
    await dst.as('post', '/api/attachments').send({ file: 'photo00002.png', mime: 'image/png', data: PNG.toString('base64') });
    const merged = await restore(dst.as, backup, { prune: false });
    expect(merged.body).toEqual({ removed: 0 });
    expect((await dst.as('get', '/api/reminders')).body.map((r) => r.title)).toContain('Only on this device');

    const replaced = await restore(dst.as, backup, { prune: true });
    expect(replaced.body).toEqual({ removed: 1 });
    expect((await dst.as('get', '/api/reminders')).body.map((r) => r.title).sort()).toEqual(['Call the plumber', 'Pay rent']);
    expect((await dst.as('get', '/api/attachments/photo00002.png')).status).toBe(200);
  });

  it('overwrites a file that changed since the backup', async () => {
    const a = await api();
    await seed(a);
    const backup = (await a.as('post', '/api/backup/export')).body;
    await a.as('post', '/api/daily/2026-11-20/entries').send({ section: 'events', text: 'written after the backup' });
    await restore(a.as, backup);
    expect((await a.as('get', '/api/daily/2026-11-20')).body.entries.events).toEqual(['Lunch with Maria']);
  });

  it('refuses paths outside the Clio folder and bad data, writing nothing from that batch', async () => {
    const { as, h } = await api();
    for (const path of ['../escape.md', 'Clio/../x.md', 'Other/x.md', '/etc/passwd', 'Clio\\Notes\\x.md', 'Clio/Notes/x.md.tmp', 'Clio//x.md', 'Clio/a:b.md']) {
      const res = await as('post', '/api/backup/restore/files').send({ files: [{ path: 'Clio/Notes/ok.md', data: '' }, { path, data: '' }] });
      expect(res.status, path).toBe(400);
    }
    expect((await as('post', '/api/backup/restore/files').send({ files: [{ path: 'Clio/Notes/x.md', data: 'not base64!' }] })).status).toBe(400);
    expect(await h.vault.readFile('Clio/Notes/ok.md')).toBeNull();
    expect(() => checkBackupPath('Clio/Notes/fine.md')).not.toThrow();
  });

  it('accepts a large signed-in restore batch but not an unauthenticated one', async () => {
    const { app, as } = await api();
    const big = 'A'.repeat(8 * 1024 * 1024); // 8 MB of base64, over the normal 1 MB limit
    expect((await as('post', '/api/backup/restore/files').send({ files: [{ path: 'Clio/Attachments/big.bin', data: big }] })).status).toBe(200);
    expect((await request(app).post('/api/backup/restore/files').send({ files: [{ path: 'Clio/Attachments/big.bin', data: big }] })).status).toBe(413);
  });

  it('rebuilds the search index after a restore', async () => {
    const src = await api();
    await seed(src);
    const backup = (await src.as('post', '/api/backup/export')).body;
    const dst = await api();
    expect((await dst.as('get', '/api/search?q=plumber')).body).toEqual([]);
    await restore(dst.as, backup);
    expect((await dst.as('get', '/api/search?q=plumber')).body.length).toBeGreaterThan(0);
  });
});
