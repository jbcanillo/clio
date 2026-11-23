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

export function snippetOf(body, query) {
  const text = body.replace(/\s+/g, ' ').trim();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 80);
  return (start > 0 ? '…' : '') + text.slice(start, start + 180);
}
