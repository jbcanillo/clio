import express from 'express';
import { z } from 'zod';
import { wrap, parse, dateParam } from '../http.js';

const short = (max) => z.string().max(max).optional();
export const entry = z.union([
  z.object({ section: z.enum(['thoughts', 'ideas', 'events']), text: z.string().trim().min(1).max(10000) }).strict(),
  z.object({ mood: z.number().int().min(1).max(5), energy: z.number().int().min(1).max(5).optional() }).strict(),
  z.object({ photo: z.string().regex(/^[a-z0-9]{8,40}\.(jpg|png|webp|gif)$/) }).strict(),
  z.object({ person: z.object({ name: z.string().trim().min(1).max(200), phone: short(60), email: short(200) }).strict() }).strict(),
  z.object({ place: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), label: short(200) }).strict() }).strict(),
]);

const range = z.object({ from: dateParam, to: dateParam });
const person = z.object({ name: z.string().trim().min(1).max(200), phone: short(60), email: short(200) }).strict();
const place = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), label: short(200) }).strict();
export const dayEdit = z.object({
  baseHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  mood: z.number().int().min(1).max(5).nullable(),
  events: z.array(z.string().max(10000)).max(200),
  thoughts: z.array(z.string().max(10000)).max(200),
  ideas: z.array(z.string().max(10000)).max(200),
  photos: z.array(z.string().regex(/^[a-z0-9]{8,40}\.(jpg|png|webp|gif)$/)).max(50),
  people: z.array(person).max(50),
  places: z.array(place).max(20),
}).strict();

export function dailyRouter({ daily, memory }) {
  const r = express.Router();
  r.get('/daily', wrap(async (req, res) => {
    const { from, to } = parse(range, req.query);
    res.json(await daily.rangeSummaries(from, to));
  }));
  r.get('/daily/:date', wrap(async (req, res) => {
    const date = parse(dateParam, req.params.date);
    const f = await daily.get(date);
    res.json(f ? { date, exists: true, frontmatter: f.frontmatter, body: f.body, hash: f.hash, entries: f.parseError ? null : daily.entriesOf(f) } : { date, exists: false });
  }));
  r.put('/daily/:date', wrap(async (req, res) => {
    const date = parse(dateParam, req.params.date);
    const out = await daily.replace(date, parse(dayEdit, req.body));
    await memory?.reindex();
    res.json(out);
  }));
  r.post('/daily/:date/entries', wrap(async (req, res) => {
    const date = parse(dateParam, req.params.date);
    await daily.append(date, parse(entry, req.body));
    await memory?.reindex();
    res.status(201).json({ ok: true });
  }));
  return r;
}
