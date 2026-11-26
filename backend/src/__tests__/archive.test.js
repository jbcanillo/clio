import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { makeApi } from './helpers/api.js';
import { createOpsSyncService } from '../services/opsSyncService.js';

const DAY = '2026-11-20';

describe('archiving instead of deleting', () => {
  it('no DELETE route exists for reminders or journal entries', async () => {
    const { as } = await makeApi();
    const r = (await as('post', '/api/reminders').send({ title: 'A', due: '2026-12-01T09:00:00Z' })).body;
    const j = (await as('post', '/api/journal').send({ text: 'J' })).body;
    expect((await as('delete', `/api/reminders/${r.id}`)).status).toBe(404);
    expect((await as('delete', `/api/journal/${j.id}`)).status).toBe(404);
    expect((await as('get', '/api/reminders')).body).toHaveLength(1);
    expect((await as('get', '/api/journal')).body).toHaveLength(1);
  });

  describe('diary days', () => {
    async function seededDay() {
      const a = await makeApi();
      await a.as('post', `/api/daily/${DAY}/entries`).send({ section: 'events', text: 'Lunch with Maria' });
      await a.as('post', `/api/daily/${DAY}/entries`).send({ mood: 4 });
      await a.as('post', `/api/daily/${DAY}/entries`).send({ person: { name: 'Maria Santos', phone: '+63 917 555 1234', email: 'maria@example.com' } });
      return a;
    }

    it('day summaries carry each person with phone and email', async () => {
      const { as } = await seededDay();
      const [s] = (await as('get', `/api/daily?from=${DAY}&to=${DAY}`)).body;
      expect(s.people).toEqual([{ name: 'Maria Santos', phone: '+63 917 555 1234', email: 'maria@example.com' }]);
    });

    it('archiving hides the day from the week, the mood chart and the weekly view, and lists it as archived', async () => {
      const { as, h } = await seededDay();
      expect((await as('post', `/api/daily/${DAY}/archive`)).body).toEqual({ date: DAY, archived: true });
      const [s] = (await as('get', `/api/daily?from=${DAY}&to=${DAY}`)).body;
      expect(s.hasEntry).toBe(false);
      expect((await as('get', `/api/analytics/mood?from=${DAY}&to=${DAY}`)).body[0].mood).toBeNull();
      const archived = (await as('get', '/api/daily/archived')).body;
      expect(archived).toHaveLength(1);
      expect(archived[0]).toMatchObject({ date: DAY, archived: true, headline: 'Lunch with Maria', mood: 4, people: [{ name: 'Maria Santos', email: 'maria@example.com' }] });
      const file = await h.vault.read(`Clio/Daily/${DAY}.md`);
      expect(file.body).toContain('Lunch with Maria'); // nothing was removed
      expect(file.frontmatter).toMatchObject({ archived: true, private: true });
    });

    it('unarchiving brings it back', async () => {
      const { as } = await seededDay();
      await as('post', `/api/daily/${DAY}/archive`);
      await as('post', `/api/daily/${DAY}/unarchive`);
      expect((await as('get', `/api/daily?from=${DAY}&to=${DAY}`)).body[0].hasEntry).toBe(true);
      expect((await as('get', '/api/daily/archived')).body).toEqual([]);
    });

    it('a new check-in or an edit on an archived day brings the day back, so nothing new goes missing', async () => {
      const { as } = await seededDay();
      await as('post', `/api/daily/${DAY}/archive`);
      await as('post', `/api/daily/${DAY}/entries`).send({ section: 'ideas', text: 'Plant tomatoes' });
      expect((await as('get', `/api/daily?from=${DAY}&to=${DAY}`)).body[0].hasEntry).toBe(true);

      await as('post', `/api/daily/${DAY}/archive`);
      const d = (await as('get', `/api/daily/${DAY}`)).body;
      const edit = { baseHash: d.hash, mood: 3, events: ['Edited'], thoughts: [], ideas: [], photos: [], people: [], places: [] };
      expect((await as('put', `/api/daily/${DAY}`).send(edit)).status).toBe(200);
      expect((await as('get', `/api/daily?from=${DAY}&to=${DAY}`)).body[0]).toMatchObject({ hasEntry: true, headline: 'Edited' });
    });

    it('archiving a day that does not exist is not_found; bad dates are refused', async () => {
      const { as } = await makeApi();
      expect((await as('post', '/api/daily/2026-01-01/archive')).status).toBe(404);
      expect((await as('post', '/api/daily/nope/archive')).status).toBe(400);
    });
  });

  describe('notes', () => {
    it('archive hides a note from the list, keeps the file, and unarchive restores it', async () => {
      const { as, h } = await makeApi();
      await h.vault.write('Clio/Notes/groceries.md', { frontmatter: { title: 'Groceries' }, body: '- [ ] Eggs\n' }, { expectedHash: null });
      const res = await as('post', '/api/notes/archive').send({ path: 'Clio/Notes/groceries.md', archived: true });
      expect(res.status).toBe(200);
      expect(res.body.hash).toMatch(/^[0-9a-f]{64}$/);
      expect((await as('get', '/api/notes')).body).toEqual([]);
      const archived = (await as('get', '/api/notes?archived=true')).body;
      expect(archived).toHaveLength(1);
      expect(archived[0]).toMatchObject({ title: 'Groceries', archived: true, checklist: [{ text: 'Eggs', done: false }] });
      expect((await h.vault.read('Clio/Notes/groceries.md')).body).toContain('Eggs');
      await as('post', '/api/notes/archive').send({ path: 'Clio/Notes/groceries.md', archived: false });
      expect((await as('get', '/api/notes')).body.map((n) => n.title)).toEqual(['Groceries']);
    });

    it('refuses paths outside Clio/Notes, private notes and unknown notes', async () => {
      const { as, h } = await makeApi();
      await h.vault.write('Clio/Notes/secret.md', { frontmatter: { private: true }, body: 'x\n' }, { expectedHash: null });
      expect((await as('post', '/api/notes/archive').send({ path: '../x.md', archived: true })).status).toBe(400);
      expect((await as('post', '/api/notes/archive').send({ path: 'Clio/Reminders/a.md', archived: true })).status).toBe(400);
      expect((await as('post', '/api/notes/archive').send({ path: 'Clio/Notes/secret.md', archived: true })).status).toBe(404);
      expect((await as('post', '/api/notes/archive').send({ path: 'Clio/Notes/missing.md', archived: true })).status).toBe(404);
    });
  });

  describe('offline sync', () => {
    async function withOps() {
      const holder = {};
      const a = await makeApi({ opsSync: { apply: (ops) => holder.ops.apply(ops) } });
      holder.ops = createOpsSyncService({ reminders: a.deps.reminders, daily: a.deps.daily, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'clio-ops-')) });
      return a;
    }

    it('applies a queued archive and unarchive', async () => {
      const { as } = await withOps();
      const r = (await as('post', '/api/reminders').send({ title: 'A', due: '2026-12-01T09:00:00Z' })).body;
      const res = await as('post', '/api/sync/ops').send({ ops: [{ id: 'op1', createdAt: 1, kind: 'reminder.archive', reminderId: r.id, archived: true }] });
      expect(res.body.results[0].status).toBe('applied');
      expect((await as('get', '/api/reminders?archived=true')).body.map((x) => x.id)).toEqual([r.id]);
      await as('post', '/api/sync/ops').send({ ops: [{ id: 'op2', createdAt: 2, kind: 'reminder.archive', reminderId: r.id, archived: false }] });
      expect((await as('get', '/api/reminders')).body.map((x) => x.id)).toEqual([r.id]);
    });

    it('a delete queued by an older app version archives instead', async () => {
      const { as, h } = await withOps();
      const r = (await as('post', '/api/reminders').send({ title: 'Old client', due: '2026-12-01T09:00:00Z' })).body;
      await as('post', '/api/sync/ops').send({ ops: [{ id: 'op3', createdAt: 3, kind: 'reminder.delete', reminderId: r.id }] });
      expect((await as('get', '/api/reminders')).body).toEqual([]);
      expect((await as('get', '/api/reminders?archived=true')).body.map((x) => x.title)).toEqual(['Old client']);
      expect(await h.vault.read(`Clio/Reminders/${r.id}.md`)).not.toBeNull();
    });
  });

  it('requires a token for the archive routes', async () => {
    const { app } = await makeApi();
    for (const [m, url] of [['post', '/api/reminders/abcdefgh12/archive'], ['post', '/api/journal/x/archive'], ['post', `/api/daily/${DAY}/archive`], ['post', '/api/notes/archive'], ['get', '/api/daily/archived']]) {
      expect((await request(app)[m](url)).status, url).toBe(401);
    }
  });
});
