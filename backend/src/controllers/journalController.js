import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const mood = z.union([z.string().max(20), z.number()]).nullable();
const extras = z.record(z.unknown());
const create = z.object({
  id: z.string().optional(),
  text: z.string().max(50_000),
  mood: mood.optional(),
  createdAt: z.string().optional(),
  extras: extras.optional(),
}).strict();
const update = z.object({ text: z.string().max(50_000).optional(), mood: mood.optional(), extras: extras.optional() }).strict();

export function journalRouter({ journal, memory }) {
  const r = express.Router();
  r.get('/journal', wrap(async (_req, res) => res.json(await journal.list())));
  r.post('/journal', wrap(async (req, res) => {
    const entry = await journal.create(parse(create, req.body));
    await memory?.reindex();
    res.status(201).json(entry);
  }));
  r.put('/journal/:id', wrap(async (req, res) => {
    const entry = await journal.update(req.params.id, parse(update, req.body));
    await memory?.reindex();
    res.json(entry);
  }));
  r.delete('/journal/:id', wrap(async (req, res) => {
    await journal.remove(req.params.id);
    await memory?.reindex();
    res.status(204).end();
  }));
  return r;
}
