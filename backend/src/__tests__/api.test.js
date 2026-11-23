import request from 'supertest';
import { makeApi } from './helpers/api.js';

describe('API authentication', () => {
  it('rejects every route without a token', async () => {
    const { app } = await makeApi();
    const routes = [
      ['get', '/api/settings'], ['put', '/api/settings'], ['post', '/api/settings/test-key'],
      ['get', '/api/daily/2026-11-23'], ['post', '/api/daily/2026-11-23/entries'],
      ['get', '/api/reminders'], ['post', '/api/reminders'], ['post', '/api/reminders/x/complete'],
      ['post', '/api/reminders/x/snooze'], ['delete', '/api/reminders/x'],
      ['get', '/api/notes'], ['get', '/api/search?q=a'], ['get', '/api/analytics/mood?from=2026-11-01&to=2026-11-02'],
    ];
    for (const [m, url] of routes) expect((await request(app)[m](url)).status, `${m} ${url}`).toBe(401);
  });
});

describe('settings', () => {
  it('never returns the OpenRouter key', async () => {
    const { as } = await makeApi();
    const put = await as('put', '/api/settings').send({ openrouterKey: 'sk-or-secret', timezone: 'Asia/Manila' });
    expect(put.status).toBe(200);
    expect(JSON.stringify(put.body)).not.toContain('sk-or-secret');
    expect(put.body).toMatchObject({ openrouterKeySet: true, timezone: 'Asia/Manila' });
    const get = await as('get', '/api/settings');
    expect(JSON.stringify(get.body)).not.toContain('sk-or-secret');
  });
  it('rejects an invalid timezone with 400', async () => {
    const { as } = await makeApi();
    expect((await as('put', '/api/settings').send({ timezone: 'Mars/Phobos' })).status).toBe(400);
  });
  it('test-key reports no_key when none is set, and the provider answer otherwise', async () => {
    const calls = [];
    const fetchFn = async (url, init) => { calls.push({ url, auth: init.headers.Authorization }); return { ok: false, status: 401 }; };
    const { as } = await makeApi({ fetchFn });
    expect((await as('post', '/api/settings/test-key')).body).toEqual({ ok: false, error: 'no_key' });
    await as('put', '/api/settings').send({ openrouterKey: 'sk-or-1' });
    const res = await as('post', '/api/settings/test-key');
    expect(res.body).toEqual({ ok: false, error: 'openrouter_401' });
    expect(calls[0].auth).toBe('Bearer sk-or-1');
  });
});

describe('daily notes', () => {
  it('rejects an invalid date with 400', async () => {
    const { as } = await makeApi();
    expect((await as('get', '/api/daily/not-a-date')).status).toBe(400);
  });
  it('returns exists:false for a day with no note, then the note after an entry', async () => {
    const { as } = await makeApi();
    expect((await as('get', '/api/daily/2026-11-23')).body).toMatchObject({ date: '2026-11-23', exists: false });
    expect((await as('post', '/api/daily/2026-11-23/entries').send({ section: 'thoughts', text: 'hi' })).status).toBe(201);
    const got = await as('get', '/api/daily/2026-11-23');
    expect(got.body.exists).toBe(true);
    expect(got.body.body).toContain('hi');
  });
  it('rejects mood 9 and empty text with 400', async () => {
    const { as } = await makeApi();
    expect((await as('post', '/api/daily/2026-11-23/entries').send({ mood: 9 })).status).toBe(400);
    expect((await as('post', '/api/daily/2026-11-23/entries').send({ section: 'ideas', text: ' ' })).status).toBe(400);
    expect((await as('post', '/api/daily/2026-11-23/entries').send({})).status).toBe(400);
  });
  it('answers 409 parse_error when the note has unreadable frontmatter', async () => {
    const { as, h } = await makeApi();
    h.writeRaw('Clio/Daily/2026-11-23.md', '---\n: bad: [yaml\n---\nmine\n');
    const res = await as('post', '/api/daily/2026-11-23/entries').send({ section: 'thoughts', text: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('parse_error');
  });
});

describe('reminders', () => {
  it('supports create, list, snooze, complete and delete', async () => {
    const { as } = await makeApi();
    const created = await as('post', '/api/reminders').send({ title: 'Dentist', due: '2026-12-01T09:00:00Z' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await as('get', '/api/reminders')).body.map((r) => r.id)).toEqual([id]);
    expect((await as('post', `/api/reminders/${id}/snooze`).send({ until: '2026-12-01T10:00:00Z' })).body.snoozedUntil).toBe('2026-12-01T10:00:00.000Z');
    expect((await as('post', `/api/reminders/${id}/complete`)).body.done).toBe(true);
    expect((await as('get', '/api/reminders?done=false')).body).toEqual([]);
    expect((await as('delete', `/api/reminders/${id}`)).status).toBe(204);
    expect((await as('get', '/api/reminders')).body).toEqual([]);
  });
  it('rejects an empty title with 400 and an unknown id with 404', async () => {
    const { as } = await makeApi();
    expect((await as('post', '/api/reminders').send({ title: '', due: '2026-12-01T09:00:00Z' })).status).toBe(400);
    expect((await as('post', '/api/reminders/nope/complete')).status).toBe(404);
  });
});

describe('search and analytics', () => {
  it('rejects an empty q with 400 and finds written notes', async () => {
    const { as, h } = await makeApi();
    expect((await as('get', '/api/search?q=')).status).toBe(400);
    await h.vault.write('Clio/Notes/a.md', { frontmatter: { title: 'Garden' }, body: 'tomatoes' }, { expectedHash: null });
    const res = await as('get', '/api/search?q=tomatoes');
    expect(res.body.map((x) => x.path)).toEqual(['Clio/Notes/a.md']);
  });
  it('hides private notes from search unless includePrivate=true', async () => {
    const { as } = await makeApi();
    await as('post', '/api/daily/2026-11-23/entries').send({ section: 'thoughts', text: 'secretword' });
    expect((await as('get', '/api/search?q=secretword')).body).toEqual([]);
    expect((await as('get', '/api/search?q=secretword&includePrivate=true')).body.length).toBe(1);
  });
  it('mood analytics returns one row per day including nulls', async () => {
    const { as } = await makeApi();
    await as('post', '/api/daily/2026-11-02/entries').send({ mood: 4 });
    const res = await as('get', '/api/analytics/mood?from=2026-11-01&to=2026-11-03');
    expect(res.body).toEqual([
      { date: '2026-11-01', mood: null, energy: null },
      { date: '2026-11-02', mood: 4, energy: null },
      { date: '2026-11-03', mood: null, energy: null },
    ]);
    expect((await as('get', '/api/analytics/mood?from=bad&to=2026-11-03')).status).toBe(400);
  });
});
