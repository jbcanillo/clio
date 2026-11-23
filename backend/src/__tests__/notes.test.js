import request from 'supertest';
import { makeApi } from './helpers/api.js';

const setup = () => makeApi();

describe('GET /api/notes', () => {
  it('requires a token', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/notes')).status).toBe(401);
  });

  it('lists only public, non-conflict notes with checklist items', async () => {
    const { as, h } = await setup();
    h.writeRaw('Clio/Notes/groceries.md', '---\ntitle: Groceries\ntags: [home, food]\nupdated: 2026-11-20T10:00:00.000Z\n---\n# Heading\n\nBuy things\n- [ ] milk\n- [x] eggs\n- [ ] bread\n');
    h.writeRaw('Clio/Notes/secret.md', '---\ntitle: Secret\nprivate: true\n---\nhidden\n');
    h.writeRaw('Clio/Notes/groceries.conflict-x.md', '---\ntitle: Groceries\n---\ncopy\n');
    const res = await as('get', '/api/notes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      path: 'Clio/Notes/groceries.md', title: 'Groceries', tags: ['home', 'food'], snippet: 'Buy things',
      checklist: [{ index: 0, text: 'milk', done: false }, { index: 1, text: 'eggs', done: true }, { index: 2, text: 'bread', done: false }],
    });
    expect(res.body[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('orders newest first', async () => {
    const { as, h } = await setup();
    h.writeRaw('Clio/Notes/old.md', '---\ntitle: Old\nupdated: 2026-01-01T00:00:00.000Z\n---\nx\n');
    h.writeRaw('Clio/Notes/new.md', '---\ntitle: New\nupdated: 2026-06-01T00:00:00.000Z\n---\nx\n');
    h.writeRaw('Clio/Notes/mid.md', '---\ntitle: Mid\ncreated: 2026-03-01T00:00:00.000Z\n---\nx\n');
    expect((await as('get', '/api/notes')).body.map((n) => n.title)).toEqual(['New', 'Mid', 'Old']);
  });

  it('returns [] for an empty vault', async () => {
    const { as } = await setup();
    expect((await as('get', '/api/notes')).body).toEqual([]);
  });

  it('returns markup verbatim as text', async () => {
    const { as, h } = await setup();
    h.writeRaw('Clio/Notes/x.md', '---\ntitle: X\n---\n<script>alert(1)</script>\n');
    expect((await as('get', '/api/notes')).body[0].snippet).toBe('<script>alert(1)</script>');
  });
});

describe('PATCH /api/notes/checklist', () => {
  const P = 'Clio/Notes/groceries.md';
  const seed = (h) => h.writeRaw(P, '---\ntitle: Groceries\n---\n# H\n\n- [ ] milk\n- [x] eggs\n- [ ] bread\n\ntrailing  text\n');
  const hashOf = async (as) => (await as('get', '/api/notes')).body[0].hash;

  it('toggles only the nth marker and round-trips byte-for-byte', async () => {
    const { as, h, deps } = await setup();
    seed(h);
    const before = (await deps.vault.read(P)).body;
    const base = await hashOf(as);
    const res = await as('patch', '/api/notes/checklist').send({ path: P, index: 1, checked: false, baseHash: base });
    expect(res.status).toBe(200);
    expect(res.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.hash).not.toBe(base);
    const after = (await deps.vault.read(P)).body;
    expect(after).toBe(before.replace('- [x] eggs', '- [ ] eggs'));
    const back = await as('patch', '/api/notes/checklist').send({ path: P, index: 1, checked: true, baseHash: res.body.hash });
    expect(back.status).toBe(200);
    expect((await deps.vault.read(P)).body).toBe(before);
  });

  it('checks an unchecked item', async () => {
    const { as, h, deps } = await setup();
    seed(h);
    const res = await as('patch', '/api/notes/checklist').send({ path: P, index: 2, checked: true, baseHash: await hashOf(as) });
    expect(res.status).toBe(200);
    expect((await deps.vault.read(P)).body).toContain('- [x] bread');
    expect((await deps.vault.read(P)).body).toContain('- [ ] milk');
  });

  it('returns 409 for a stale baseHash and leaves the file unchanged', async () => {
    const { as, h, deps } = await setup();
    seed(h);
    const before = (await deps.vault.read(P)).hash;
    const res = await as('patch', '/api/notes/checklist').send({ path: P, index: 0, checked: true, baseHash: 'a'.repeat(64) });
    expect(res.status).toBe(409);
    expect((await deps.vault.read(P)).hash).toBe(before);
  });

  it('returns 400 for an index with no checklist line', async () => {
    const { as, h } = await setup();
    seed(h);
    const res = await as('patch', '/api/notes/checklist').send({ path: P, index: 99, checked: true, baseHash: await hashOf(as) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for bad paths and bodies', async () => {
    const { as } = await setup();
    const ok = { index: 0, checked: true, baseHash: 'a'.repeat(64) };
    for (const path of ['../x.md', 'Clio/Notes/../x.md', 'Clio/Daily/2026-11-23.md', 'Clio/Notes/x.txt']) {
      expect((await as('patch', '/api/notes/checklist').send({ ...ok, path })).status).toBe(400);
    }
    expect((await as('patch', '/api/notes/checklist').send({ ...ok, path: P, extra: 1 })).status).toBe(400);
    expect((await as('patch', '/api/notes/checklist').send({ ...ok, path: P, index: -1 })).status).toBe(400);
  });

  it('returns 404 for an unknown note', async () => {
    const { as } = await setup();
    const res = await as('patch', '/api/notes/checklist').send({ path: 'Clio/Notes/nope.md', index: 0, checked: true, baseHash: 'a'.repeat(64) });
    expect(res.status).toBe(404);
  });
});
