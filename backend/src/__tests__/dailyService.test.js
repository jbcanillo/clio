import fs from 'node:fs';
import path from 'node:path';
import { makeVault } from './helpers/vault.js';
import { createDailyService } from '../services/dailyService.js';

let h, daily;
beforeEach(() => { h = makeVault(); daily = createDailyService({ vault: h.vault, tz: 'UTC' }); });
const D = '2026-11-23';
const file = () => path.join(h.root, 'Clio/Daily', `${D}.md`);

describe('dailyService', () => {
  it('creates the daily note as private and appends under section headings', async () => {
    await daily.append(D, { section: 'thoughts', text: 'Felt calm' });
    const f = await daily.get(D);
    expect(f.frontmatter.private).toBe(true);
    expect(f.frontmatter.date).toBe(D);
    expect(f.body).toContain('## Thoughts');
    expect(f.body).toContain('Felt calm');
  });
  it('never alters existing text: two appends keep both lines in order', async () => {
    await daily.append(D, { section: 'events', text: 'Dentist at 9' });
    await daily.append(D, { section: 'events', text: 'Lunch with Ana' });
    const body = (await daily.get(D)).body;
    expect(body.indexOf('Dentist at 9')).toBeLessThan(body.indexOf('Lunch with Ana'));
  });
  it('keeps sections separate and preserves hand-written content from Obsidian', async () => {
    h.writeRaw(`Clio/Daily/${D}.md`, `---\ndate: ${D}\nprivate: true\ncustom: keep-me\n---\nMy own paragraph.\n\n## Ideas\n- old idea\n`);
    await daily.append(D, { section: 'ideas', text: 'new idea' });
    await daily.append(D, { section: 'thoughts', text: 'a thought' });
    const f = await daily.get(D);
    expect(f.frontmatter.custom).toBe('keep-me');
    expect(f.body).toContain('My own paragraph.');
    expect(f.body.indexOf('old idea')).toBeLessThan(f.body.indexOf('new idea'));
    expect(f.body.indexOf('## Thoughts')).toBeGreaterThan(f.body.indexOf('new idea'));
  });
  it('stores mood and energy in frontmatter', async () => {
    await daily.append(D, { mood: 4, energy: 2 });
    const f = await daily.get(D);
    expect(f.frontmatter.mood).toBe(4);
    expect(f.frontmatter.energy).toBe(2);
  });
  it('rejects invalid dates, moods and empty text', async () => {
    await expect(daily.append('23-11-2026', { mood: 3 })).rejects.toThrow(/date/);
    await expect(daily.append(D, { mood: 9 })).rejects.toThrow(/mood/);
    await expect(daily.append(D, { section: 'thoughts', text: '   ' })).rejects.toThrow(/text/);
  });
  it('hasEntry is false for no file or an empty skeleton, true after text or mood', async () => {
    expect(await daily.hasEntry(D)).toBe(false);
    h.writeRaw(`Clio/Daily/${D}.md`, `---\ndate: ${D}\nprivate: true\n---\n## Thoughts\n\n`);
    expect(await daily.hasEntry(D)).toBe(false);
    await daily.append(D, { mood: 3 });
    expect(await daily.hasEntry(D)).toBe(true);
  });
  it('hasEntry is true after text only', async () => {
    await daily.append(D, { section: 'ideas', text: 'x' });
    expect(await daily.hasEntry(D)).toBe(true);
  });
  it('refuses to append to a note with unreadable frontmatter and leaves it untouched', async () => {
    const raw = '---\n: bad: [yaml\n---\nmy text\n';
    h.writeRaw(`Clio/Daily/${D}.md`, raw);
    await expect(daily.append(D, { section: 'thoughts', text: 'x' })).rejects.toMatchObject({ code: 'parse_error' });
    expect(fs.readFileSync(file(), 'utf8')).toBe(raw);
  });
  it('moodSeries returns one row per day with nulls for missing days', async () => {
    await daily.append('2026-11-22', { mood: 2 });
    await daily.append('2026-11-24', { mood: 5, energy: 4 });
    expect(await daily.moodSeries('2026-11-22', '2026-11-24')).toEqual([
      { date: '2026-11-22', mood: 2, energy: null },
      { date: '2026-11-23', mood: null, energy: null },
      { date: '2026-11-24', mood: 5, energy: 4 },
    ]);
  });
  it('moodSeries rejects ranges over 366 days', async () => {
    await expect(daily.moodSeries('2024-01-01', '2026-01-01')).rejects.toThrow(/range/);
  });
  it('rangeSummaries summarises mood, section counts and headline; empty days have hasEntry:false', async () => {
    await daily.append('2026-11-22', { mood: 4 });
    await daily.append('2026-11-22', { section: 'events', text: 'Dentist at 9' });
    await daily.append('2026-11-22', { section: 'events', text: 'Lunch' });
    await daily.append('2026-11-22', { section: 'thoughts', text: 'Felt calm' });
    expect(await daily.rangeSummaries('2026-11-22', '2026-11-23')).toEqual([
      { date: '2026-11-22', mood: 4, energy: null, headline: 'Dentist at 9', hasEntry: true, sections: { thoughts: 1, ideas: 0, events: 2 }, photos: [], people: [], places: [] },
      { date: '2026-11-23', mood: null, energy: null, headline: '', hasEntry: false, sections: { thoughts: 0, ideas: 0, events: 0 }, photos: [], people: [], places: [] },
    ]);
  });
  it('rangeSummaries truncates the headline to 120 chars', async () => {
    await daily.append(D, { section: 'ideas', text: 'x'.repeat(200) });
    const [s] = await daily.rangeSummaries(D, D);
    expect(s.headline).toBe('x'.repeat(120));
  });
  it('rangeSummaries reports a note with unreadable frontmatter as an empty day instead of throwing', async () => {
    h.writeRaw(`Clio/Daily/${D}.md`, '---\n: bad: [yaml\n---\n## Thoughts\n- mine\n');
    await daily.append('2026-11-24', { mood: 2 });
    const out = await daily.rangeSummaries(D, '2026-11-24');
    expect(out[0]).toEqual({ date: D, mood: null, energy: null, headline: '', hasEntry: false, sections: { thoughts: 0, ideas: 0, events: 0 }, photos: [], people: [], places: [] });
    expect(out[1]).toMatchObject({ date: '2026-11-24', mood: 2, hasEntry: true });
  });
  it('rangeSummaries rejects 367 days and reversed ranges', async () => {
    await expect(daily.rangeSummaries('2026-01-01', '2027-01-02')).rejects.toThrow(/range/);
    await expect(daily.rangeSummaries('2026-11-23', '2026-11-22')).rejects.toThrow(/range/);
  });
});
