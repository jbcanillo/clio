import { ValidationError } from '../errors.js';
import { ConflictError } from './vaultService.js';
import { isValidDateKey, addDaysKey } from './timeUtil.js';
import { ATTACHMENT_FILE } from './attachmentService.js';

const SECTIONS = { thoughts: 'Thoughts', ideas: 'Ideas', events: 'Events' };
/** Sections for what a check-in attaches; written as plain markdown so Obsidian shows them too. */
const EXTRA = { photos: 'Photos', people: 'People', places: 'Places' };
const PHOTO_LINE = /^!\[[^\]]*\]\(\.\.\/Attachments\/([a-z0-9]{8,40}\.(?:jpg|png|webp|gif))\)$/;
const PLACE_LINE = /^(.*) \((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)$/;

/** One line of owner text: no newlines (they would break the markdown structure). */
const oneLine = (v, max, field) => {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') throw new ValidationError(`${field} must be text`);
  const s = v.replace(/[\r\n]+/g, ' ').trim();
  if (s.length > max) throw new ValidationError(`${field} is too long`);
  return s;
};

/** Validates an attachment-type entry and returns [section key, bullet text], or null for other entries. */
function extraLine(entry) {
  if (entry?.photo !== undefined) {
    if (typeof entry.photo !== 'string' || !ATTACHMENT_FILE.test(entry.photo)) throw new ValidationError('photo must be an attachment file name');
    return ['photos', `![photo](../Attachments/${entry.photo})`];
  }
  if (entry?.person !== undefined) {
    const p = entry.person ?? {};
    const name = oneLine(p.name, 200, 'person.name');
    if (!name) throw new ValidationError('person.name must not be empty');
    const parts = [name, oneLine(p.phone, 60, 'person.phone'), oneLine(p.email, 200, 'person.email')].filter(Boolean);
    return ['people', parts.join(' · ')];
  }
  if (entry?.place !== undefined) {
    const { lat, lng } = entry.place ?? {};
    if (typeof lat !== 'number' || lat < -90 || lat > 90 || typeof lng !== 'number' || lng < -180 || lng > 180) {
      throw new ValidationError('place needs lat (-90..90) and lng (-180..180)');
    }
    const label = oneLine(entry.place.label, 200, 'place.label') || 'Pinned location';
    return ['places', `${label} (${lat.toFixed(5)}, ${lng.toFixed(5)})`];
  }
  return null;
}
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

/**
 * Replaces the bullet lines of one `## Heading` section, keeping any other lines in it (prose the
 * owner wrote in Obsidian). An emptied section with nothing else in it is removed.
 */
function replaceSection(body, heading, bullets) {
  const lines = body.replace(/\s+$/, '').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  const newLines = bullets.map((b) => `- ${b}`);
  if (start === -1) {
    if (!newLines.length) return body;
    const prefix = body.trim() === '' ? '' : `${lines.join('\n')}\n\n`;
    return `${prefix}## ${heading}\n${newLines.join('\n')}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  const kept = lines.slice(start + 1, end).filter((l) => !/^-\s+/.test(l.trim()));
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  const section = newLines.length || kept.some((l) => l.trim())
    ? [`## ${heading}`, ...newLines, ...kept, ...(end < lines.length ? [''] : [])]
    : [];
  const out = [...lines.slice(0, start), ...section, ...lines.slice(end)];
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.length ? `${out.join('\n')}\n` : '';
}

const PEOPLE_SEP = ' · ';
function parsePerson(line) {
  const [name, ...rest] = line.split(PEOPLE_SEP);
  const p = { name };
  for (const part of rest) {
    if (part.includes('@')) p.email = part;
    else p.phone = part;
  }
  return p;
}

/** Daily notes in Clio/Daily/YYYY-MM-DD.md. Check-ins append; an edit rewrites only Clio's bullet lists. */
export function createDailyService({ vault }) {
  const get = (date) => vault.read(dailyPath(date));

  async function append(date, entry) {
    if (!isValidDateKey(date)) throw new ValidationError('date must be YYYY-MM-DD');
    const isMood = entry && entry.mood !== undefined;
    const extra = isMood ? null : extraLine(entry);
    if (isMood) {
      if (![1, 2, 3, 4, 5].includes(entry.mood)) throw new ValidationError('mood must be an integer 1-5');
      if (entry.energy !== undefined && ![1, 2, 3, 4, 5].includes(entry.energy)) throw new ValidationError('energy must be an integer 1-5');
    } else if (!extra) {
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
      } else if (extra) {
        body = appendToSection(body, EXTRA[extra[0]], extra[1]);
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
    const bullets = { thoughts: [], ideas: [], events: [], photos: [], people: [], places: [] };
    const byHeading = Object.fromEntries(Object.entries({ ...SECTIONS, ...EXTRA }).map(([k, v]) => [v, k]));
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
        out.push({ date: d, mood: null, energy: null, headline: '', hasEntry: false, sections: { thoughts: 0, ideas: 0, events: 0 }, photos: [], people: [], places: [] });
        continue;
      }
      const b = sectionBullets(f.body);
      const photos = b.photos.map((l) => PHOTO_LINE.exec(l)?.[1]).filter(Boolean);
      const people = b.people.map((l) => l.split(' · ')[0]).filter(Boolean);
      const places = b.places.map((l) => {
        const m = PLACE_LINE.exec(l);
        return m ? { label: m[1], lat: Number(m[2]), lng: Number(m[3]) } : null;
      }).filter(Boolean);
      const m = f.frontmatter.mood;
      const e = f.frontmatter.energy;
      out.push({
        date: d,
        mood: typeof m === 'number' ? m : null,
        energy: typeof e === 'number' ? e : null,
        headline: (b.events[0] ?? b.thoughts[0] ?? b.ideas[0] ?? '').slice(0, 120),
        hasEntry: true,
        sections: { thoughts: b.thoughts.length, ideas: b.ideas.length, events: b.events.length },
        photos,
        people,
        places,
      });
    }
    return out;
  }

  /** A day's entries, structured, for the edit form. */
  function entriesOf(f) {
    const b = sectionBullets(f.body);
    return {
      events: b.events,
      thoughts: b.thoughts,
      ideas: b.ideas,
      photos: b.photos.map((l) => PHOTO_LINE.exec(l)?.[1]).filter(Boolean),
      people: b.people.map(parsePerson).filter((p) => p.name),
      places: b.places.map((l) => {
        const m = PLACE_LINE.exec(l);
        return m ? { label: m[1], lat: Number(m[2]), lng: Number(m[3]) } : null;
      }).filter(Boolean),
    };
  }

  /**
   * Edits a day: sets the mood and replaces the bullets of each section with the given lists.
   * `baseHash` is the hash the owner edited (null for a day that did not exist); a mismatch is a ConflictError.
   */
  async function replace(date, day) {
    if (!isValidDateKey(date)) throw new ValidationError('date must be YYYY-MM-DD');
    if (day.mood !== null && day.mood !== undefined && ![1, 2, 3, 4, 5].includes(day.mood)) throw new ValidationError('mood must be an integer 1-5');
    const text = (list, field) => (list ?? []).map((t) => oneLine(t, 10000, field)).filter(Boolean);
    const lines = {
      events: text(day.events, 'events'),
      thoughts: text(day.thoughts, 'thoughts'),
      ideas: text(day.ideas, 'ideas'),
      photos: (day.photos ?? []).map((photo) => extraLine({ photo })[1]),
      people: (day.people ?? []).map((person) => extraLine({ person })[1]),
      places: (day.places ?? []).map((place) => extraLine({ place })[1]),
    };
    const current = await get(date);
    if (current?.parseError) throw codedError('Daily note has unreadable frontmatter; fix it in Obsidian first', 'parse_error');
    if ((current ? current.hash : null) !== (day.baseHash ?? null)) throw new ConflictError(current);
    const frontmatter = current ? { ...current.frontmatter } : { date, tags: [], private: true };
    if (day.mood === null || day.mood === undefined) delete frontmatter.mood;
    else frontmatter.mood = day.mood;
    let body = current ? current.body : '';
    for (const [key, heading] of Object.entries({ ...SECTIONS, ...EXTRA })) body = replaceSection(body, heading, lines[key]);
    const { hash } = await vault.write(dailyPath(date), { frontmatter, body }, { expectedHash: current ? current.hash : null });
    return { hash };
  }

  return { append, get, hasEntry, moodSeries, rangeSummaries, entriesOf, replace };
}
