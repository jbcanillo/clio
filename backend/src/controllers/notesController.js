import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const toggleBody = z.object({
  path: z.string().min(1),
  index: z.number().int().min(0),
  checked: z.boolean(),
  baseHash: z.string().min(1),
}).strict();

const archiveBody = z.object({ path: z.string().min(1).max(500), archived: z.boolean() }).strict();

export function notesRouter({ notes, memory }) {
  const r = express.Router();
  r.get('/notes', wrap(async (req, res) => res.json(await notes.list({ archived: req.query.archived === 'true' }))));
  // There is no delete: notes are archived (and can be restored), never removed.
  r.post('/notes/archive', wrap(async (req, res) => {
    const b = parse(archiveBody, req.body);
    const { hash } = await notes.archive(b.path, b.archived);
    res.json({ hash });
  }));
  r.patch('/notes/checklist', wrap(async (req, res) => {
    const b = parse(toggleBody, req.body);
    const { hash } = await notes.toggleChecklist(b.path, b.index, b.checked, b.baseHash);
    await memory?.reindex();
    res.json({ hash });
  }));
  return r;
}
