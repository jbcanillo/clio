import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const create = z.object({
  title: z.string().trim().min(1).max(300),
  due: z.string().datetime({ offset: true }),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  repeat: z.enum(['never', 'daily', 'weekly', 'monthly', 'yearly']).optional(),
  notes: z.string().max(10000).optional(),
}).strict();
const query = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  done: z.enum(['true', 'false']).optional(),
});
const snooze = z.object({ until: z.string().datetime({ offset: true }) }).strict();

export function reminderRouter({ reminders, memory }) {
  const r = express.Router();
  r.get('/reminders', wrap(async (req, res) => {
    const q = parse(query, req.query);
    res.json(await reminders.list({ from: q.from, to: q.to, done: q.done === undefined ? undefined : q.done === 'true' }));
  }));
  r.post('/reminders', wrap(async (req, res) => {
    const created = await reminders.create(parse(create, req.body));
    await memory?.reindex();
    res.status(201).json(created);
  }));
  r.post('/reminders/:id/complete', wrap(async (req, res) => res.json(await reminders.complete(req.params.id))));
  r.post('/reminders/:id/snooze', wrap(async (req, res) => res.json(await reminders.snooze(req.params.id, parse(snooze, req.body).until))));
  r.delete('/reminders/:id', wrap(async (req, res) => {
    await reminders.remove(req.params.id);
    await memory?.reindex();
    res.status(204).end();
  }));
  return r;
}
