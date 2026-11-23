import express from 'express';
import { z } from 'zod';
import { wrap, parse, dateParam } from '../http.js';

const entry = z.union([
  z.object({ section: z.enum(['thoughts', 'ideas', 'events']), text: z.string().trim().min(1).max(10000) }).strict(),
  z.object({ mood: z.number().int().min(1).max(5), energy: z.number().int().min(1).max(5).optional() }).strict(),
]);

export function dailyRouter({ daily, memory }) {
  const r = express.Router();
  r.get('/daily/:date', wrap(async (req, res) => {
    const date = parse(dateParam, req.params.date);
    const f = await daily.get(date);
    res.json(f ? { date, exists: true, frontmatter: f.frontmatter, body: f.body, hash: f.hash } : { date, exists: false });
  }));
  r.post('/daily/:date/entries', wrap(async (req, res) => {
    const date = parse(dateParam, req.params.date);
    await daily.append(date, parse(entry, req.body));
    await memory?.reindex();
    res.status(201).json({ ok: true });
  }));
  return r;
}
