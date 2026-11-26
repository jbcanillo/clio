import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

export const reminderId = z.string().regex(/^[a-z0-9]{8,40}$/);
export const create = z.object({
  id: reminderId.optional(),
  title: z.string().trim().min(1).max(300),
  due: z.string().datetime({ offset: true }),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  repeat: z.enum(['never', 'daily', 'weekly', 'monthly', 'yearly']).optional(),
  notes: z.string().max(10000).optional(),
  extras: z.record(z.unknown()).optional(),
}).strict();
export const patch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  due: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  repeat: z.enum(['never', 'daily', 'weekly', 'monthly', 'yearly']).optional(),
  notes: z.string().max(10000).optional(),
  extras: z.record(z.unknown()).optional(),
  done: z.boolean().optional(),
  snoozedUntil: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();
const query = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  done: z.enum(['true', 'false']).optional(),
  archived: z.enum(['true', 'false']).optional(),
});
export const snooze = z.object({ until: z.string().datetime({ offset: true }) }).strict();

export function reminderRouter({ reminders, memory }) {
  const r = express.Router();
  r.get('/reminders', wrap(async (req, res) => {
    const q = parse(query, req.query);
    res.json(await reminders.list({ from: q.from, to: q.to, done: q.done === undefined ? undefined : q.done === 'true', archived: q.archived === 'true' }));
  }));
  r.post('/reminders', wrap(async (req, res) => {
    const created = await reminders.create(parse(create, req.body));
    await memory?.reindex();
    res.status(201).json(created);
  }));
  r.put('/reminders/:id', wrap(async (req, res) => res.json(await reminders.update(req.params.id, parse(patch, req.body)))));
  r.post('/reminders/:id/complete', wrap(async (req, res) => res.json(await reminders.complete(req.params.id))));
  r.post('/reminders/:id/snooze', wrap(async (req, res) => res.json(await reminders.snooze(req.params.id, parse(snooze, req.body).until))));
  // There is no DELETE: reminders are archived (and can be restored), never removed.
  r.post('/reminders/:id/archive', wrap(async (req, res) => res.json(await reminders.archive(req.params.id, true))));
  r.post('/reminders/:id/unarchive', wrap(async (req, res) => res.json(await reminders.archive(req.params.id, false))));
  return r;
}
