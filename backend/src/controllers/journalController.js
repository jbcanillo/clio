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
  r.get('/journal', wrap(async (req, res) => res.json(await journal.list({ archived: req.query.archived === 'true' }))));
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
  // There is no DELETE: entries are archived (and can be restored), never removed.
  r.post('/journal/:id/archive', wrap(async (req, res) => res.json(await journal.archive(req.params.id, true))));
  r.post('/journal/:id/unarchive', wrap(async (req, res) => res.json(await journal.archive(req.params.id, false))));
  return r;
}
