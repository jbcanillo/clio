import { ValidationError } from '../errors.js';
import { ConflictError } from './vaultService.js';
import { isValidDateKey, addDaysKey } from './timeUtil.js';

const SECTIONS = { thoughts: 'Thoughts', ideas: 'Ideas', events: 'Events' };
const MAX_RANGE_DAYS = 366;
const dailyPath = (date) => `Clio/Daily/${date}.md`;

function codedError(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Appends `- text` at the end of the `## Heading` section, creating it if needed. */
function appendToSection(body, heading, text) {
  const line = `- ${text.trim()}`;
  const lines = body.replace(/\s+$/, '').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) {
    const prefix = body.trim() === '' ? '' : `${lines.join('\n')}\n\n`;
    return `${prefix}## ${heading}\n${line}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  let insertAt = end;
  while (insertAt > start + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  lines.splice(insertAt, 0, line);
  return `${lines.join('\n')}\n`;
}

/** Daily notes in Clio/Daily/YYYY-MM-DD.md. Only appends; never rewrites existing text. */
export function createDailyService({ vault }) {
  const get = (date) => vault.read(dailyPath(date));

  async function append(date, entry) {
    if (!isValidDateKey(date)) throw new ValidationError('date must be YYYY-MM-DD');
    const isMood = entry && entry.mood !== undefined;
    if (isMood) {
      if (![1, 2, 3, 4, 5].includes(entry.mood)) throw new ValidationError('mood must be an integer 1-5');
      if (entry.energy !== undefined && ![1, 2, 3, 4, 5].includes(entry.energy)) throw new ValidationError('energy must be an integer 1-5');
    } else {
      if (!SECTIONS[entry?.section]) throw new ValidationError('section must be thoughts, ideas or events');
      if (typeof entry.text !== 'string' || entry.text.trim() === '') throw new ValidationError('text must not be empty');
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await get(date);
      if (current?.parseError) throw codedError('Daily note has unreadable frontmatter; fix it in Obsidian first', 'parse_error');
      const frontmatter = current ? { ...current.frontmatter } : { date, tags: [], private: true };
      let body = current ? current.body : '';
      if (isMood) {
        frontmatter.mood = entry.mood;
        if (entry.energy !== undefined) frontmatter.energy = entry.energy;
      } else {
        body = appendToSection(body, SECTIONS[entry.section], entry.text);
      }
      try {
        await vault.write(dailyPath(date), { frontmatter, body }, { expectedHash: current ? current.hash : null });
        return;
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt === 2) throw e;
      }
    }
  }

  function noteHasEntry(f) {
    if (!f) return false;
    if (f.frontmatter.mood !== undefined && f.frontmatter.mood !== null) return true;
    const content = f.body.split('\n').map((l) => l.trim()).filter((l) => l && !/^#{1,6}\s/.test(l) && l !== '-');
    return content.length > 0;
  }

  async function hasEntry(date) {
    return noteHasEntry(await get(date));
  }

  /** Yields each date key in [from, to], enforcing validity and the 366-day cap. */
  function* eachDay(from, to) {
    if (!isValidDateKey(from) || !isValidDateKey(to) || to < from) throw new ValidationError('invalid range');
    for (let d = from, n = 0; d <= to; d = addDaysKey(d, 1), n++) {
      if (n >= MAX_RANGE_DAYS) throw new ValidationError('range too large (max 366 days)');
      yield d;
    }
  }

  async function moodSeries(from, to) {
    const out = [];
    for (const d of eachDay(from, to)) {
      const f = await get(d);
      const m = f?.frontmatter?.mood;
      const e = f?.frontmatter?.energy;
      out.push({ date: d, mood: typeof m === 'number' ? m : null, energy: typeof e === 'number' ? e : null });
    }
    return out;
  }

  /** Bullet texts under each known `## ` section of a daily note body. */
  function sectionBullets(body) {
    const bullets = { thoughts: [], ideas: [], events: [] };
    const byHeading = Object.fromEntries(Object.entries(SECTIONS).map(([k, v]) => [v, k]));
    let current = null;
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      const h = /^##\s+(.*)$/.exec(line);
      if (h) { current = byHeading[h[1].trim()] ?? null; continue; }
      const b = /^-\s+(.+)$/.exec(line);
      if (current && b) bullets[current].push(b[1].trim());
    }
    return bullets;
  }

  async function rangeSummaries(from, to) {
    const out = [];
    for (const d of eachDay(from, to)) {
      const f = await get(d);
      if (!f || f.parseError || !noteHasEntry(f)) {
        out.push({ date: d, mood: null, energy: null, headline: '', hasEntry: false, sections: { thoughts: 0, ideas: 0, events: 0 } });
        continue;
      }
      const b = sectionBullets(f.body);
      const m = f.frontmatter.mood;
      const e = f.frontmatter.energy;
      out.push({
        date: d,
        mood: typeof m === 'number' ? m : null,
        energy: typeof e === 'number' ? e : null,
        headline: (b.events[0] ?? b.thoughts[0] ?? b.ideas[0] ?? '').slice(0, 120),
        hasEntry: true,
        sections: { thoughts: b.thoughts.length, ideas: b.ideas.length, events: b.events.length },
      });
    }
    return out;
  }

  return { append, get, hasEntry, moodSeries, rangeSummaries };
}
