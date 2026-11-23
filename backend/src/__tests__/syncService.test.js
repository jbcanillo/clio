import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { makeVault } from './helpers/vault.js';
import { makeApi } from './helpers/api.js';
import { createSyncService } from '../services/syncService.js';

const change = (over = {}) => ({ id: 'c1', path: null, title: 'Garden ideas', body: 'plant tomatoes', baseHash: null, createdAt: 1_700_000_000_000, ...over });
function setup() {
  const h = makeVault();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-sync-'));
  const make = (vault = h.vault) => createSyncService({ vault, dataDir });
  return { h, dataDir, make, sync: make() };
}

describe('syncService', () => {
  it('creates a new note under Clio/Notes and returns its path and hash', async () => {
    const { sync, h } = setup();
    const [r] = await sync.apply([change()]);
    expect(r).toMatchObject({ id: 'c1', status: 'applied', path: 'Clio/Notes/garden-ideas.md' });
    const f = await h.vault.read(r.path);
    expect(f.body).toContain('plant tomatoes');
    expect(f.frontmatter.title).toBe('Garden ideas');
    expect(f.hash).toBe(r.hash);
  });
  it('replaying the same change id is a duplicate and creates nothing new', async () => {
    const { sync, h } = setup();
    await sync.apply([change()]);
    const [r] = await sync.apply([change()]);
    expect(r.status).toBe('duplicate');
    expect(await h.vault.list('Clio/Notes')).toHaveLength(1);
  });
  it('two new notes with the same title get different paths', async () => {
    const { sync } = setup();
    const res = await sync.apply([change({ id: 'a' }), change({ id: 'b', body: 'other' })]);
    expect(new Set(res.map((r) => r.path)).size).toBe(2);
  });
  it('edits an existing note when baseHash matches, keeping its frontmatter', async () => {
    const { sync, h } = setup();
    const [created] = await sync.apply([change()]);
    const [r] = await sync.apply([change({ id: 'c2', path: created.path, baseHash: created.hash, body: 'plant basil' })]);
    expect(r.status).toBe('applied');
    const f = await h.vault.read(created.path);
    expect(f.body).toContain('plant basil');
    expect(f.frontmatter.title).toBe('Garden ideas');
  });
  it('keeps both versions on a stale baseHash: original untouched, incoming saved as a conflict copy', async () => {
    const { sync, h } = setup();
    const [created] = await sync.apply([change()]);
    fs.appendFileSync(path.join(h.root, created.path), '\nedited in Obsidian');
    const [r] = await sync.apply([change({ id: 'abcdef123', path: created.path, baseHash: created.hash, body: 'phone edit' })]);
    expect(r.status).toBe('conflict');
    expect(r.conflictPath).toBe('Clio/Notes/garden-ideas.conflict-abcdef.md');
    expect((await h.vault.read(created.path)).body).toContain('edited in Obsidian');
    const copy = await h.vault.read(r.conflictPath);
    expect(copy.body).toContain('phone edit');
    expect(copy.frontmatter.conflictOf).toBe(created.path);
  });
  it('replaying a conflicted change returns duplicate with the conflict path and creates no second copy', async () => {
    const { sync, h } = setup();
    const [created] = await sync.apply([change()]);
    fs.appendFileSync(path.join(h.root, created.path), '\nx');
    const c = change({ id: 'abcdef123', path: created.path, baseHash: created.hash, body: 'phone edit' });
    const [first] = await sync.apply([c]);
    const [again] = await sync.apply([c]);
    expect(again).toMatchObject({ status: 'duplicate', conflictPath: first.conflictPath });
    expect(await h.vault.list('Clio/Notes')).toHaveLength(2);
  });
  it('recreates a note that was deleted on the server meanwhile', async () => {
    const { sync, h } = setup();
    const [r] = await sync.apply([change({ path: 'Clio/Notes/gone.md', baseHash: 'a'.repeat(64) })]);
    expect(r.status).toBe('applied');
    expect(await h.vault.read('Clio/Notes/gone.md')).not.toBeNull();
  });
  it('refuses paths outside Clio/Notes', async () => {
    const { sync } = setup();
    await expect(sync.apply([change({ path: 'Clio/Daily/2026-11-23.md' })])).rejects.toThrow(/Clio\/Notes/);
    await expect(sync.apply([change({ path: 'Clio/Notes/../Daily/x.md' })])).rejects.toThrow(/Clio\/Notes/);
  });
  it('after an unexpected error keeps receipts of earlier changes, so a retry applies only the rest', async () => {
    const { h, make, dataDir } = setup();
    const realWrite = h.vault.write;
    let calls = 0;
    const flaky = { ...h.vault, write: async (...a) => { if (++calls === 2) throw new Error('disk hiccup'); return realWrite(...a); } };
    const batch = [change({ id: 'a', title: 'One' }), change({ id: 'b', title: 'Two' }), change({ id: 'c', title: 'Three' })];
    await expect(make(flaky).apply(batch)).rejects.toThrow('disk hiccup');
    const res = await createSyncService({ vault: h.vault, dataDir }).apply(batch);
    expect(res.map((r) => r.status)).toEqual(['duplicate', 'applied', 'applied']);
    expect(await h.vault.list('Clio/Notes')).toHaveLength(3);
  });
});

describe('POST /api/sync/notes', () => {
  it('requires auth, validates the body and returns per-change results', async () => {
    const h = makeVault();
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-sync-'));
    const { app, as } = await makeApi({ sync: createSyncService({ vault: h.vault, dataDir }) });
    expect((await request(app).post('/api/sync/notes').send({ changes: [] })).status).toBe(401);
    expect((await as('post', '/api/sync/notes').send({ changes: [{ id: '', title: 'x' }] })).status).toBe(400);
    expect((await as('post', '/api/sync/notes').send({ changes: [change({ path: 'Clio/Daily/x.md' })] })).status).toBe(400);
    const ok = await as('post', '/api/sync/notes').send({ changes: [change()] });
    expect(ok.status).toBe(200);
    expect(ok.body.results[0]).toMatchObject({ id: 'c1', status: 'applied' });
  });
});
