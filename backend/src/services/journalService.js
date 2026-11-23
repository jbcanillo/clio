import crypto from 'node:crypto';
import { ValidationError } from '../errors.js';
import { ConflictError } from './vaultService.js';

const DIR = 'Clio/Events';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const coded = (message, code) => Object.assign(new Error(message), { code });

/**
 * Journal entries, one markdown file each in Clio/Events/<date>-<id>.md.
 * They are private by default (kept out of AI prompts unless the owner shares them).
 */
export function createJournalService({ vault, now = () => new Date(), newId = () => crypto.randomBytes(6).toString('hex') }) {
  const toEntry = (f) => ({
    id: f.frontmatter.id,
    text: f.body.trim(),
    ...(f.frontmatter.mood !== undefined ? { mood: f.frontmatter.mood } : {}),
    createdAt: f.frontmatter.createdAt,
    ...(f.frontmatter.extras ? { extras: f.frontmatter.extras } : {}),
  });

  async function all() {
    const out = [];
    for (const p of await vault.list(DIR)) {
      const f = await vault.read(p);
      if (f && !f.parseError && f.frontmatter.kind === 'journal' && f.frontmatter.id) out.push(f);
    }
    return out;
  }
  async function find(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw coded('Entry not found', 'not_found');
    const f = (await all()).find((x) => x.frontmatter.id === id);
    if (!f) throw coded('Entry not found', 'not_found');
    return f;
  }

  async function list() {
    return (await all()).map(toEntry).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function create({ id, text, mood, createdAt, extras }) {
    if (typeof text !== 'string' || text.trim() === '') throw new ValidationError('text must not be empty');
    const entryId = id === undefined ? newId() : id;
    if (typeof entryId !== 'string' || !ID_RE.test(entryId)) throw new ValidationError('id must be 1-64 letters, digits, - or _');
    const created = createdAt ? new Date(createdAt) : now();
    if (Number.isNaN(created.getTime())) throw new ValidationError('createdAt must be a date');
    if ((await all()).some((x) => x.frontmatter.id === entryId)) throw coded('Entry already exists', 'conflict');
    const frontmatter = { kind: 'journal', private: true, id: entryId, createdAt: created.toISOString() };
    if (mood !== undefined && mood !== null) frontmatter.mood = mood;
    if (extras && Object.keys(extras).length) frontmatter.extras = extras;
    const p = `${DIR}/${frontmatter.createdAt.slice(0, 10)}-${entryId}.md`;
    await vault.write(p, { frontmatter, body: `${text.trim()}\n` }, { expectedHash: null });
    return toEntry({ frontmatter, body: text });
  }

  async function update(id, changes) {
    const f = await find(id);
    const frontmatter = { ...f.frontmatter };
    let body = f.body;
    if (changes.text !== undefined) {
      if (typeof changes.text !== 'string' || changes.text.trim() === '') throw new ValidationError('text must not be empty');
      body = `${changes.text.trim()}\n`;
    }
    if (changes.mood !== undefined) {
      if (changes.mood === null) delete frontmatter.mood;
      else frontmatter.mood = changes.mood;
    }
    if (changes.extras !== undefined) {
      if (Object.keys(changes.extras).length) frontmatter.extras = changes.extras;
      else delete frontmatter.extras;
    }
    try {
      await vault.write(f.path, { frontmatter, body }, { expectedHash: f.hash });
    } catch (e) {
      if (e instanceof ConflictError) throw coded('Entry changed meanwhile', 'conflict');
      throw e;
    }
    return toEntry({ frontmatter, body });
  }

  async function remove(id) {
    const f = await find(id);
    await vault.remove(f.path, { expectedHash: f.hash });
  }

  return { list, create, update, remove };
}
