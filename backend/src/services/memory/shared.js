const DATE_IN_PATH = /(\d{4}-\d{2}-\d{2})\.md$/;

export function titleOf(file) {
  if (typeof file.frontmatter.title === 'string' && file.frontmatter.title) return file.frontmatter.title;
  const heading = file.body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return file.path.split('/').pop().replace(/\.md$/, '');
}

export function dateOf(file) {
  if (typeof file.frontmatter.date === 'string') return file.frontmatter.date;
  return file.path.match(DATE_IN_PATH)?.[1];
}

const oneLine = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * The text a file is searched by: its body plus the details a reminder keeps in
 * frontmatter extras (contact, location), which are not in the body.
 */
export function searchText(file) {
  const extras = file.frontmatter?.extras;
  if (!extras || typeof extras !== 'object') return file.body;
  const lines = [];
  const c = extras.contact;
  if (c && typeof c === 'object' && oneLine(c.name)) {
    lines.push(`Contact: ${[c.name, c.phone, c.email].map(oneLine).filter(Boolean).join(' · ')}`);
  }
  const loc = extras.location;
  if (loc && typeof loc === 'object' && (oneLine(loc.label) || Number.isFinite(loc.lat))) {
    lines.push(`Location: ${oneLine(loc.label) || `${loc.lat}, ${loc.lng}`}`);
  }
  return lines.length ? `${file.body.replace(/\s+$/, '')}\n${lines.join('\n')}\n` : file.body;
}

const LINE_MAX = 240;
const SNIPPET_MAX = 600;

/** Cuts one long line down to a window around the first matching term. */
function windowed(line, terms) {
  if (line.length <= LINE_MAX) return line;
  const lower = line.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 80);
  return `${start > 0 ? '…' : ''}${line.slice(start, start + LINE_MAX)}…`;
}

/**
 * The lines that mention the query, each kept whole (so "Name · phone · email"
 * is never cut in half), or the opening lines when none match.
 */
export function snippetOf(body, query) {
  const terms = String(query).toLowerCase().split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter((t) => t.length > 1);
  const lines = body.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !/^#{1,6}( |$)/.test(l));
  const matching = lines.filter((l) => terms.some((t) => l.toLowerCase().includes(t)));
  const picked = (matching.length ? matching : lines.slice(0, 3)).map((l) => windowed(l, terms));
  let out = '';
  for (const l of picked) {
    const next = out ? `${out} … ${l}` : l;
    if (next.length > SNIPPET_MAX) return out || `${l.slice(0, SNIPPET_MAX)}…`;
    out = next;
  }
  return out;
}
