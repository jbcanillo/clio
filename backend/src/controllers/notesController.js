import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const toggleBody = z.object({
  path: z.string().min(1),
  index: z.number().int().min(0),
  checked: z.boolean(),
  baseHash: z.string().min(1),
}).strict();

export function notesRouter({ notes, memory }) {
  const r = express.Router();
  r.get('/notes', wrap(async (_req, res) => res.json(await notes.list())));
  r.patch('/notes/checklist', wrap(async (req, res) => {
    const b = parse(toggleBody, req.body);
    const { hash } = await notes.toggleChecklist(b.path, b.index, b.checked, b.baseHash);
    await memory?.reindex();
    res.json({ hash });
  }));
  return r;
}
