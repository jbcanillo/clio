import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVaultService, ConflictError, PathError } from '../services/vaultService.js';

let root, outside, vault;
beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-vault-'));
  root = path.join(base, 'vault');
  outside = path.join(base, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'top secret');
  vault = createVaultService({ vaultDir: root });
});
afterEach(() => vi.restoreAllMocks());

describe('vaultService path safety', () => {
  it('rejects ../ traversal on read and write', async () => {
    await expect(vault.read('../outside/secret.txt')).rejects.toBeInstanceOf(PathError);
    await expect(vault.write('../escape.md', { frontmatter: {}, body: 'x' }, { expectedHash: null })).rejects.toBeInstanceOf(PathError);
  });
  it('rejects absolute paths', async () => {
    await expect(vault.read('/etc/passwd')).rejects.toBeInstanceOf(PathError);
  });
  it('rejects a symlink that points outside the vault', async () => {
    fs.symlinkSync(outside, path.join(root, 'link'));
    await expect(vault.read('link/secret.txt')).rejects.toBeInstanceOf(PathError);
    await expect(vault.write('link/new.md', { frontmatter: {}, body: 'x' }, { expectedHash: null })).rejects.toBeInstanceOf(PathError);
    expect(fs.existsSync(path.join(outside, 'new.md'))).toBe(false);
  });
});

describe('vaultService read/write', () => {
  it('returns null for a missing file', async () => {
    expect(await vault.read('Clio/Notes/none.md')).toBeNull();
  });
  it('round-trips frontmatter and body and returns a stable hash', async () => {
    const { hash } = await vault.write('Clio/Notes/a.md', { frontmatter: { title: 'A', tags: ['x'] }, body: 'hello' }, { expectedHash: null });
    const f = await vault.read('Clio/Notes/a.md');
    expect(f.frontmatter).toEqual({ title: 'A', tags: ['x'] });
    expect(f.body.trim()).toBe('hello');
    expect(f.hash).toBe(hash);
  });
  it('throws ConflictError with the on-disk content on a stale hash', async () => {
    await vault.write('n.md', { frontmatter: {}, body: 'v1' }, { expectedHash: null });
    fs.appendFileSync(path.join(root, 'n.md'), '\nedited in Obsidian');
    const err = await vault.write('n.md', { frontmatter: {}, body: 'v2' }, { expectedHash: 'stale' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.current.body).toContain('edited in Obsidian');
  });
  it('expectedHash:null conflicts when the file already exists', async () => {
    await vault.write('n.md', { frontmatter: {}, body: 'v1' }, { expectedHash: null });
    await expect(vault.write('n.md', { frontmatter: {}, body: 'v2' }, { expectedHash: null })).rejects.toBeInstanceOf(ConflictError);
  });
  it('updates when the hash matches', async () => {
    const { hash } = await vault.write('n.md', { frontmatter: {}, body: 'v1' }, { expectedHash: null });
    await vault.write('n.md', { frontmatter: {}, body: 'v2' }, { expectedHash: hash });
    expect((await vault.read('n.md')).body.trim()).toBe('v2');
  });
  it('reads a file with broken frontmatter with parseError and leaves it untouched', async () => {
    const raw = '---\n: bad: [yaml\n---\nstill my text\n';
    fs.writeFileSync(path.join(root, 'broken.md'), raw);
    const f = await vault.read('broken.md');
    expect(f.parseError).toBe(true);
    expect(f.body).toContain('still my text');
    expect(fs.readFileSync(path.join(root, 'broken.md'), 'utf8')).toBe(raw);
  });
  it('a failed rename leaves the original file intact and no temp file behind', async () => {
    const { hash } = await vault.write('n.md', { frontmatter: {}, body: 'original' }, { expectedHash: null });
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('disk full'));
    await expect(vault.write('n.md', { frontmatter: {}, body: 'new' }, { expectedHash: hash })).rejects.toThrow('disk full');
    expect(fs.readFileSync(path.join(root, 'n.md'), 'utf8')).toContain('original');
    expect(fs.readdirSync(root).filter((f) => f.includes('.tmp'))).toEqual([]);
  });
});

describe('vaultService list/remove/uniquePath', () => {
  it('lists markdown files recursively relative to the vault', async () => {
    await vault.write('Clio/Notes/a.md', { frontmatter: {}, body: '1' }, { expectedHash: null });
    await vault.write('Clio/Daily/2026-01-01.md', { frontmatter: {}, body: '2' }, { expectedHash: null });
    fs.writeFileSync(path.join(root, 'Clio', 'Notes', 'image.png'), 'x');
    expect(await vault.list('Clio')).toEqual(['Clio/Daily/2026-01-01.md', 'Clio/Notes/a.md']);
    expect(await vault.list('Missing')).toEqual([]);
  });
  it('removes a file only with the right hash', async () => {
    const { hash } = await vault.write('n.md', { frontmatter: {}, body: '1' }, { expectedHash: null });
    await expect(vault.remove('n.md', { expectedHash: 'stale' })).rejects.toBeInstanceOf(ConflictError);
    await vault.remove('n.md', { expectedHash: hash });
    expect(await vault.read('n.md')).toBeNull();
  });
  it('builds safe unique slugs for unicode and duplicate titles', async () => {
    const p1 = await vault.uniquePath('Clio/Notes', 'Café ☕ ideas');
    expect(p1).toBe('Clio/Notes/cafe-ideas.md');
    await vault.write(p1, { frontmatter: {}, body: 'x' }, { expectedHash: null });
    const p2 = await vault.uniquePath('Clio/Notes', 'Café ☕ ideas');
    expect(p2).toBe('Clio/Notes/cafe-ideas-2.md');
    expect(path.basename(p2)).toMatch(/^[a-z0-9.-]+$/);
    expect(await vault.uniquePath('Clio/Notes', '☕☕')).toBe('Clio/Notes/untitled.md');
  });
});

describe('vault parse cache', () => {
  it('reports parseError on every read of the same broken frontmatter', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-pc-'));
    fs.writeFileSync(path.join(root, 'a.md'), '---\ntitle: [unclosed\n bad: : :\n---\nx\n');
    const vault = createVaultService({ vaultDir: root });
    expect((await vault.read('a.md')).parseError).toBe(true);
    expect((await vault.read('a.md')).parseError).toBe(true);
  });
});
