import fs from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../errors.js';
import { ConflictError } from './vaultService.js';

const NOTES_DIR = 'Clio/Notes';
const MAX_RECEIPTS = 5000;

/**
 * Applies notes written offline. Idempotent by change id; never overwrites a
 * note that changed since the client last saw it (the incoming version is
 * saved next to it as "<name>.conflict-<id>.md").
 */
export function createSyncService({ vault, dataDir, memory }) {
  const file = path.join(dataDir, 'sync-receipts.json');
  fs.mkdirSync(dataDir, { recursive: true });

  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const save = (receipts) => {
    const keys = Object.keys(receipts);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_RECEIPTS))) delete receipts[k];
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(receipts));
    fs.renameSync(tmp, file);
  };

  const assertNotePath = (p) => {
    if (typeof p !== 'string' || !p.startsWith(`${NOTES_DIR}/`) || !p.endsWith('.md') || p.split('/').includes('..')) {
      throw new ValidationError(`path must be a markdown file inside ${NOTES_DIR}/`);
    }
  };

  async function applyOne(c) {
    const created = new Date(c.createdAt).toISOString();

    if (c.path === null || c.path === undefined) {
      const p = await vault.uniquePath(NOTES_DIR, c.title);
      const { hash } = await vault.write(p, { frontmatter: { title: c.title, created }, body: `${c.body}\n` }, { expectedHash: null });
      return { status: 'applied', path: p, hash };
    }

    assertNotePath(c.path);
    const current = await vault.read(c.path);
    if (current === null) {
      const { hash } = await vault.write(c.path, { frontmatter: { title: c.title, created }, body: `${c.body}\n` }, { expectedHash: null });
      return { status: 'applied', path: c.path, hash };
    }
    if (!current.parseError && current.hash === c.baseHash) {
      try {
        const frontmatter = { ...current.frontmatter, title: c.title, updated: new Date().toISOString() };
        const { hash } = await vault.write(c.path, { frontmatter, body: `${c.body}\n` }, { expectedHash: current.hash });
        return { status: 'applied', path: c.path, hash };
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
      }
    }
    const conflictPath = c.path.replace(/\.md$/, `.conflict-${c.id.slice(0, 6)}.md`);
    await vault.write(conflictPath, { frontmatter: { title: c.title, created, conflictOf: c.path }, body: `${c.body}\n` }, { expectedHash: null }).catch((e) => {
      if (!(e instanceof ConflictError)) throw e; // same conflict copy already written by an interrupted earlier attempt
    });
    const latest = await vault.read(c.path);
    return { status: 'conflict', path: c.path, hash: latest?.hash, conflictPath };
  }

  async function apply(changes) {
    const receipts = load();
    const results = [];
    for (const c of changes) {
      const seen = receipts[c.id];
      if (seen) {
        results.push({ id: c.id, ...seen, status: 'duplicate' });
        continue;
      }
      const result = await applyOne(c);
      receipts[c.id] = result;
      save(receipts); // persist after every change so a crash cannot replay applied ones
      results.push({ id: c.id, ...result });
    }
    if (results.some((r) => r.status !== 'duplicate')) await memory?.reindex();
    return results;
  }

  const notFound = () => Object.assign(new Error('Note not found'), { code: 'not_found' });

  async function read(p) {
    assertNotePath(p);
    const f = await vault.read(p);
    if (!f) throw notFound();
    return { path: p, title: f.frontmatter.title ?? null, body: f.body, hash: f.hash };
  }

  /** choice: 'mine' = phone version wins, 'theirs' = server version wins, 'both' = keep the copy as its own note. */
  async function resolve({ path: p, conflictPath, choice }) {
    assertNotePath(p);
    assertNotePath(conflictPath);
    if (!conflictPath.startsWith(p.replace(/\.md$/, '.conflict-'))) throw new ValidationError('conflictPath is not a conflict copy of this note');
    const copy = await vault.read(conflictPath);
    if (!copy) throw notFound();
    const original = await vault.read(p);
    let copyPath;
    if (choice === 'mine') {
      await vault.write(p, { frontmatter: original?.frontmatter ?? { title: copy.frontmatter.title }, body: copy.body }, { expectedHash: original ? original.hash : null });
    } else if (choice === 'both') {
      const { conflictOf, ...fm } = copy.frontmatter; // eslint-disable-line no-unused-vars
      const title = `${fm.title ?? 'Note'} (copy)`;
      copyPath = await vault.uniquePath(NOTES_DIR, title);
      await vault.write(copyPath, { frontmatter: { ...fm, title }, body: copy.body }, { expectedHash: null });
    } else if (choice !== 'theirs') {
      throw new ValidationError("choice must be 'mine', 'theirs' or 'both'");
    }
    await vault.remove(conflictPath, { expectedHash: copy.hash });
    await memory?.reindex();
    return { path: p, ...(copyPath ? { copyPath } : {}) };
  }

  return { apply, read, resolve };
}
