import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeApi } from './helpers/api.js';
import { createOpsSyncService } from '../services/opsSyncService.js';
import { createSyncService } from '../services/syncService.js';

const D = '2026-11-20';
const empty = { events: [], thoughts: [], ideas: [], photos: [], people: [], places: [] };

async function api() {
  const holder = {};
  const a = await makeApi({ opsSync: { apply: (ops) => holder.ops.apply(ops) } });
  holder.ops = createOpsSyncService({ reminders: a.deps.reminders, daily: a.deps.daily, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'clio-ops-')) });
  return a;
}

describe('editing a journal day', () => {
  it('GET /api/daily/:date returns the entries, structured', async () => {
    const { as } = await api();
    await as('post', `/api/daily/${D}/entries`).send({ mood: 3 });
    await as('post', `/api/daily/${D}/entries`).send({ section: 'events', text: 'Lunch with Ana' });
    await as('post', `/api/daily/${D}/entries`).send({ person: { name: 'Ana', email: 'ana@example.com' } });
    await as('post', `/api/daily/${D}/entries`).send({ place: { lat: 1.5, lng: 2.5, label: 'Cafe' } });
    const day = (await as('get', `/api/daily/${D}`)).body;
    expect(day.entries).toEqual({
      ...empty,
      events: ['Lunch with Ana'],
      people: [{ name: 'Ana', email: 'ana@example.com' }],
      places: [{ label: 'Cafe', lat: 1.5, lng: 2.5 }],
    });
  });

  it('PUT replaces the bullets and mood, keeping text written outside them', async () => {
    const { as, h } = await api();
    await h.vault.write(`Clio/Daily/${D}.md`, {
      frontmatter: { date: D, mood: 2 },
      body: 'Morning pages by hand.\n\n## Events\n- Old event\nA note under events\n\n## Thoughts\n- Old thought\n',
    }, { expectedHash: null });
    const { hash } = (await as('get', `/api/daily/${D}`)).body;
    const res = await as('put', `/api/daily/${D}`).send({ ...empty, baseHash: hash, mood: 5, events: ['New event', 'Second'], photos: ['photo00001.jpg'] });
    expect(res.status).toBe(200);
    const f = await h.vault.read(`Clio/Daily/${D}.md`);
    expect(f.frontmatter.mood).toBe(5);
    expect(f.body).toContain('Morning pages by hand.');
    expect(f.body).toContain('## Events\n- New event\n- Second\nA note under events');
    expect(f.body).not.toContain('Old event');
    expect(f.body).not.toContain('## Thoughts'); // emptied, nothing else in it
    expect(f.body).toContain('## Photos\n- ![photo](../Attachments/photo00001.jpg)');
    expect(res.body.hash).toBe(f.hash);
  });

  it('refuses an edit of a version that changed meanwhile (409)', async () => {
    const { as } = await api();
    await as('post', `/api/daily/${D}/entries`).send({ mood: 3 });
    const stale = (await as('get', `/api/daily/${D}`)).body.hash;
    await as('post', `/api/daily/${D}/entries`).send({ section: 'ideas', text: 'Added elsewhere' });
    expect((await as('put', `/api/daily/${D}`).send({ ...empty, baseHash: stale, mood: 1 })).status).toBe(409);
    expect((await as('put', `/api/daily/2026-11-21`).send({ ...empty, baseHash: null, mood: 4 })).status).toBe(200); // a new day
  });

  it('can clear the mood, and validates input', async () => {
    const { as, h } = await api();
    await as('post', `/api/daily/${D}/entries`).send({ mood: 3 });
    const { hash } = (await as('get', `/api/daily/${D}`)).body;
    await as('put', `/api/daily/${D}`).send({ ...empty, baseHash: hash, mood: null, thoughts: ['ok'] });
    expect((await h.vault.read(`Clio/Daily/${D}.md`)).frontmatter.mood).toBeUndefined();
    expect((await as('put', `/api/daily/${D}`).send({ ...empty, baseHash: null, mood: 9 })).status).toBe(400);
    expect((await as('put', `/api/daily/${D}`).send({ ...empty, baseHash: null, mood: 1, photos: ['../x.md'] })).status).toBe(400);
  });

  it('an offline edit syncs through /api/sync/ops, and a stale one is rejected as a conflict', async () => {
    const { as } = await api();
    await as('post', `/api/daily/${D}/entries`).send({ mood: 3 });
    const { hash } = (await as('get', `/api/daily/${D}`)).body;
    const op = (id, baseHash) => ({ id, createdAt: 1, kind: 'daily.replace', date: D, day: { ...empty, baseHash, mood: 4, ideas: ['offline idea'] } });
    const ok = await as('post', '/api/sync/ops').send({ ops: [op('e1', hash)] });
    expect(ok.body.results[0].status).toBe('applied');
    const stale = await as('post', '/api/sync/ops').send({ ops: [op('e2', hash)] });
    expect(stale.body.results[0]).toMatchObject({ status: 'rejected', code: 'conflict' });
  });
});

describe('editing a note', () => {
  it('a synced edit can rename the note and marks it updated', async () => {
    const a = await api();
    const sync = createSyncService({ vault: a.h.vault, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'clio-sync-')) });
    const [created] = await sync.apply([{ id: 'n1', path: null, title: 'Old', body: 'hello', baseHash: null, createdAt: 1_700_000_000_000 }]);
    const [edited] = await sync.apply([{ id: 'n2', path: created.path, title: 'New title', body: 'hello again', baseHash: created.hash, createdAt: 1_700_000_000_001 }]);
    expect(edited.status).toBe('applied');
    const f = await a.h.vault.read(created.path);
    expect(f.frontmatter.title).toBe('New title');
    expect(f.frontmatter.updated).toBeTruthy();
    expect(f.body).toContain('hello again');
  });
});
