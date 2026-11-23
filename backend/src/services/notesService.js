const NOTES_DIR = 'Clio/Notes';
const CHECK = /^\s*- \[( |x|X)\] (.*)$/;

const iso = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  return typeof v === 'string' ? v : '';
};

function summarize(note) {
  const fm = note.frontmatter ?? {};
  const checklist = [];
  let snippet = '';
  for (const line of note.body.split(/\r?\n/)) {
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
  return { list };
}
