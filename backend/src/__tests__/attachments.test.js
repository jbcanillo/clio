import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { makeApi } from './helpers/api.js';
import { createAttachmentService } from '../services/attachmentService.js';
import { createOpsSyncService } from '../services/opsSyncService.js';

// Smallest valid images: a 1x1 PNG and a JPEG header (content is checked by magic bytes only).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);

async function api() {
  const holder = {};
  const a = await makeApi({
    attachments: { put: (x) => holder.att.put(x), get: (f) => holder.att.get(f) },
    opsSync: { apply: (ops) => holder.ops.apply(ops) },
  });
  holder.att = createAttachmentService({ vault: a.h.vault });
  holder.ops = createOpsSyncService({ reminders: a.deps.reminders, daily: a.deps.daily, attachments: holder.att, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'clio-ops-')) });
  return a;
}

describe('attachments', () => {
  it('requires a token', async () => {
    const { app } = await api();
    expect((await request(app).get('/api/attachments/abcdefgh12.png')).status).toBe(401);
  });

  it('stores a photo in Clio/Attachments and reads it back as base64', async () => {
    const { as, h } = await api();
    const put = await as('post', '/api/attachments').send({ file: 'photo00001.png', mime: 'image/png', data: PNG.toString('base64') });
    expect(put.status).toBe(201);
    expect(put.body).toEqual({ file: 'photo00001.png', path: 'Clio/Attachments/photo00001.png' });
    expect(await h.vault.readFile('Clio/Attachments/photo00001.png')).toEqual(PNG);
    const got = await as('get', '/api/attachments/photo00001.png');
    expect(got.body).toEqual({ file: 'photo00001.png', mime: 'image/png', data: PNG.toString('base64') });
  });

  it('is idempotent: a second upload with the same name keeps the first file', async () => {
    const { as, h } = await api();
    await as('post', '/api/attachments').send({ file: 'photo00001.jpg', mime: 'image/jpeg', data: JPEG.toString('base64') });
    const other = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(8, 2)]);
    const again = await as('post', '/api/attachments').send({ file: 'photo00001.jpg', mime: 'image/jpeg', data: other.toString('base64') });
    expect(again.status).toBe(200);
    expect(await h.vault.readFile('Clio/Attachments/photo00001.jpg')).toEqual(JPEG);
  });

  it('rejects bad names, mismatched types and non-image content', async () => {
    const { as } = await api();
    const send = (b) => as('post', '/api/attachments').send(b);
    expect((await send({ file: '../evil.png', mime: 'image/png', data: PNG.toString('base64') })).status).toBe(400);
    expect((await send({ file: 'photo00001.png', mime: 'image/jpeg', data: PNG.toString('base64') })).status).toBe(400);
    expect((await send({ file: 'photo00001.png', mime: 'image/png', data: Buffer.from('<svg/>').toString('base64') })).status).toBe(400);
    expect((await send({ file: 'photo00001.svg', mime: 'image/png', data: PNG.toString('base64') })).status).toBe(400);
  });

  it('404s for unknown or malformed names', async () => {
    const { as } = await api();
    expect((await as('get', '/api/attachments/missing0001.png')).status).toBe(404);
    expect((await as('get', '/api/attachments/..%2Fsecret.md')).status).toBe(404);
  });

  it('accepts photos queued offline through /api/sync/ops', async () => {
    const { as } = await api();
    const res = await as('post', '/api/sync/ops').send({
      ops: [{ id: 'p1', createdAt: 1, kind: 'attachment.put', file: 'queued0001.png', mime: 'image/png', data: PNG.toString('base64') }],
    });
    expect(res.body.results[0].status).toBe('applied');
    expect((await as('get', '/api/attachments/queued0001.png')).status).toBe(200);
  });
});

describe('check-in attachments', () => {
  it('appends photos, people and places as markdown and summarises them', async () => {
    const { as, h } = await api();
    const day = '2026-11-20';
    for (const entry of [
      { photo: 'photo00001.jpg' },
      { person: { name: 'Ana Cruz', phone: '+63 900 000 0000' } },
      { place: { lat: 14.5995, lng: 120.9842, label: 'Manila Bay' } },
      { place: { lat: 1, lng: 2 } },
    ]) {
      expect((await as('post', `/api/daily/${day}/entries`).send(entry)).status).toBe(201);
    }
    const note = await h.vault.read(`Clio/Daily/${day}.md`);
    expect(note.body).toContain('## Photos\n- ![photo](../Attachments/photo00001.jpg)');
    expect(note.body).toContain('## People\n- Ana Cruz · +63 900 000 0000');
    expect(note.body).toContain('- Manila Bay (14.59950, 120.98420)');
    const [s] = (await as('get', `/api/daily?from=${day}&to=${day}`)).body;
    expect(s).toMatchObject({
      hasEntry: true,
      photos: ['photo00001.jpg'],
      people: ['Ana Cruz'],
      places: [{ label: 'Manila Bay', lat: 14.5995, lng: 120.9842 }, { label: 'Pinned location', lat: 1, lng: 2 }],
    });
  });

  it('rejects unsafe entries', async () => {
    const { as } = await api();
    const post = (e) => as('post', '/api/daily/2026-11-20/entries').send(e);
    expect((await post({ photo: '../../etc/passwd' })).status).toBe(400);
    expect((await post({ person: { name: '' } })).status).toBe(400);
    expect((await post({ place: { lat: 200, lng: 0 } })).status).toBe(400);
  });

  it('keeps newlines out of the markdown', async () => {
    const { as, h } = await api();
    await as('post', '/api/daily/2026-11-20/entries').send({ person: { name: 'Bo\n## Ideas\n- injected' } });
    const note = await h.vault.read('Clio/Daily/2026-11-20.md');
    expect(note.body).not.toContain('\n## Ideas');
  });
});

describe('note photos', () => {
  it('lists photo links separately and keeps them out of the snippet', async () => {
    const { as, h } = await api();
    await h.vault.write('Clio/Notes/trip.md', { frontmatter: { title: 'Trip' }, body: '![photo](../Attachments/photo00001.jpg)\nGreat view\n' }, { expectedHash: null });
    const [n] = (await as('get', '/api/notes')).body;
    expect(n).toMatchObject({ title: 'Trip', snippet: 'Great view', photos: ['photo00001.jpg'] });
  });
});
