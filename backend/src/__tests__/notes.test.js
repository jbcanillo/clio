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
