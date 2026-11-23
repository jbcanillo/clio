import request from 'supertest';
import { makeVault } from './helpers/vault.js';
import { makeApi } from './helpers/api.js';
import { createJournalService } from '../services/journalService.js';

let h, svc;
beforeEach(() => { h = makeVault(); svc = createJournalService({ vault: h.vault, now: () => new Date('2026-11-23T10:00:00Z'), newId: () => 'gen1' }); });

describe('journalService', () => {
  it('creates a private entry file in Clio/Events and lists it newest first', async () => {
    const a = await svc.create({ id: 'a1', text: 'First', mood: '😊', createdAt: '2026-11-20T08:00:00Z' });
    await svc.create({ text: 'Second' });
    expect(a).toMatchObject({ id: 'a1', text: 'First', mood: '😊', createdAt: '2026-11-20T08:00:00.000Z' });
    const f = await h.vault.read('Clio/Events/2026-11-20-a1.md');
    expect(f.frontmatter).toMatchObject({ kind: 'journal', private: true, id: 'a1' });
    expect((await svc.list()).map((e) => e.id)).toEqual(['gen1', 'a1']);
  });
  it('updates text and mood and keeps the id and date', async () => {
    await svc.create({ id: 'a1', text: 'First', createdAt: '2026-11-20T08:00:00Z' });
    const u = await svc.update('a1', { text: 'Edited', mood: '😐' });
    expect(u).toMatchObject({ id: 'a1', text: 'Edited', mood: '😐', createdAt: '2026-11-20T08:00:00.000Z' });
  });
  it('removes an entry; unknown ids are not_found', async () => {
    await svc.create({ id: 'a1', text: 'First' });
    await svc.remove('a1');
    expect(await svc.list()).toEqual([]);
    await expect(svc.update('a1', { text: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.remove('../x')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('rejects empty text and invalid ids', async () => {
    await expect(svc.create({ text: '  ' })).rejects.toThrow(/text/);
    await expect(svc.create({ id: '../evil', text: 'x' })).rejects.toThrow(/id/);
  });
  it('ignores other notes in Clio/Events and files with broken frontmatter', async () => {
    await h.vault.write('Clio/Events/2026-11-01-meeting.md', { frontmatter: { title: 'Meeting' }, body: 'not a journal entry' }, { expectedHash: null });
    h.writeRaw('Clio/Events/bad.md', '---\n: bad: [yaml\n---\n');
    await svc.create({ id: 'a1', text: 'Mine' });
    expect((await svc.list()).map((e) => e.id)).toEqual(['a1']);
  });
  it('an id used twice does not create a second file', async () => {
    await svc.create({ id: 'a1', text: 'one', createdAt: '2026-11-20T08:00:00Z' });
    await expect(svc.create({ id: 'a1', text: 'two', createdAt: '2026-11-20T08:00:00Z' })).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('journal HTTP', () => {
  it('requires auth and supports the CRUD cycle', async () => {
    const { app, as } = await makeApi();
    expect((await request(app).get('/api/journal')).status).toBe(401);
    const created = await as('post', '/api/journal').send({ text: 'Hello', mood: '😊' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await as('get', '/api/journal')).body.map((e) => e.id)).toEqual([id]);
    expect((await as('put', `/api/journal/${id}`).send({ text: 'Edited' })).body.text).toBe('Edited');
    expect((await as('delete', `/api/journal/${id}`)).status).toBe(204);
    expect((await as('put', '/api/journal/nope').send({ text: 'x' })).status).toBe(404);
    expect((await as('post', '/api/journal').send({ text: '' })).status).toBe(400);
  });
  it('PUT /api/reminders/:id updates a reminder', async () => {
    const { as } = await makeApi();
    const r = (await as('post', '/api/reminders').send({ title: 'A', due: '2026-12-01T09:00:00Z', extras: { x: 1 } })).body;
    const u = await as('put', `/api/reminders/${r.id}`).send({ title: 'B', done: true });
    expect(u.body).toMatchObject({ title: 'B', done: true, extras: { x: 1 } });
    expect((await as('put', `/api/reminders/${r.id}`).send({ priority: 'nope' })).status).toBe(400);
    expect((await as('put', '/api/reminders/missing').send({ title: 'B' })).status).toBe(404);
  });
});
