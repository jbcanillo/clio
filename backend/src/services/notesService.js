import { ValidationError } from '../errors.js';
import { ConflictError } from './vaultService.js';
const NOTES_DIR = 'Clio/Notes';
const CHECK = /^\s*- \[( |x|X)\] (.*)$/;
const PHOTO = /^\s*!\[[^\]]*\]\(\.\.\/Attachments\/([a-z0-9]{8,40}\.(?:jpg|png|webp|gif))\)\s*$/;
const NOTE_PATH_ERR = `path must be a markdown file directly inside ${NOTES_DIR}/`;
// Exactly Clio/Notes/<name>.md: no nested folders, no backslashes (Windows separators), no dot-segments.
const NOTE_PATH = /^Clio\/Notes\/(?!\.\.?\.md$)[^/\\\u0000]+\.md$/;
const notFound = () => Object.assign(new Error('Note not found'), { code: 'not_found' });

const iso = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  return typeof v === 'string' ? v : '';
};

function summarize(note) {
  const fm = note.frontmatter ?? {};
  const checklist = [];
  const photos = [];
  let snippet = '';
  for (const line of note.body.split(/\r?\n/)) {
    const photo = PHOTO.exec(line);
    if (photo) {
      photos.push(photo[1]);
      continue;
    }
    const m = CHECK.exec(line);
    if (m) {
      checklist.push({ index: checklist.length, text: m[2].trim(), done: m[1] !== ' ' });
    } else if (!snippet && line.trim() && !/^\s*#/.test(line)) {
      snippet = line.trim().slice(0, 160);
    }
  }
  const file = note.path.split('/').pop().replace(/\.md$/, '');
  return {
    path: note.path,
    title: typeof fm.title === 'string' && fm.title.trim() ? fm.title : file,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    snippet,
    updated: iso(fm.updated) || iso(fm.created),
    hash: note.hash,
    checklist,
    photos,
  };
}

/** Read-only listing of the owner's notes for the Notes tab. */
export function createNotesService({ vault }) {
  async function list() {
    const paths = (await vault.list(NOTES_DIR))
      .filter((p) => !p.slice(NOTES_DIR.length + 1).includes('/') && !p.includes('.conflict-'));
    const out = [];
    for (const p of paths) {
      const note = await vault.read(p);
      if (!note || note.parseError || note.frontmatter?.private === true) continue;
      out.push(summarize(note));
    }
    // Stable sort keeps file order for notes without a date.
    return out.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
  }

  /** Rewrites only the marker of the nth checklist line (same CHECK + indexing as list()). */
  async function toggleChecklist(path, index, checked, baseHash) {
    if (typeof path !== 'string' || !NOTE_PATH.test(path)) throw new ValidationError(NOTE_PATH_ERR);
    // Notes that list() hides (conflict copies, private notes) can't be edited through this route either.
    if (path.includes('.conflict-')) throw notFound();
    const current = await vault.read(path);
    if (!current) throw notFound();
    if (current.frontmatter?.private === true) throw notFound();
    if (current.parseError) throw Object.assign(new Error('Note has unreadable frontmatter; fix it in Obsidian first'), { code: 'parse_error' });
    if (current.hash !== baseHash) throw new ConflictError(current);
    const parts = current.body.split(/(\r?\n)/); // keep separators so every other byte survives
    let n = 0;
    let found = false;
    for (let i = 0; i < parts.length; i += 2) {
      if (!CHECK.test(parts[i])) continue;
      if (n++ === index) {
        parts[i] = parts[i].replace(/\[( |x|X)\]/, checked ? '[x]' : '[ ]');
        found = true;
        break;
      }
    }
    if (!found) throw new ValidationError(`no checklist item at index ${index}`);
    return vault.write(path, { frontmatter: current.frontmatter, body: parts.join('') }, { expectedHash: current.hash });
  }
  return { list, toggleChecklist };
}
