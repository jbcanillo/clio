import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const change = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  path: z.string().max(500).nullable(),
  title: z.string().trim().min(1).max(300),
  body: z.string().max(200_000),
  baseHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  createdAt: z.number().int().positive(),
});
const body = z.object({ changes: z.array(change).max(100) });

const resolveBody = z.object({
  path: z.string().max(500),
  conflictPath: z.string().max(500),
  choice: z.enum(['mine', 'theirs', 'both']),
}).strict();

export function syncRouter({ sync }) {
  const r = express.Router();
  r.post('/sync/notes', wrap(async (req, res) => {
    res.json({ results: await sync.apply(parse(body, req.body).changes) });
  }));
  r.get('/notes/read', wrap(async (req, res) => {
    res.json(await sync.read(parse(z.string().max(500), req.query.path)));
  }));
  r.post('/sync/resolve', wrap(async (req, res) => {
    res.json(await sync.resolve(parse(resolveBody, req.body)));
  }));
  return r;
}
