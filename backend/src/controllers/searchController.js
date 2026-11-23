import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const query = z.object({
  q: z.string().trim().min(1, 'q must not be empty').max(500),
  includePrivate: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export function searchRouter({ memory }) {
  const r = express.Router();
  r.get('/search', wrap(async (req, res) => {
    const q = parse(query, req.query);
    res.json(await memory.search(q.q, { includePrivate: q.includePrivate === 'true', limit: q.limit }));
  }));
  return r;
}
