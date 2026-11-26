import express from 'express';
import { z } from 'zod';
import { wrap, parse, dateParam } from '../http.js';
import { create, patch, reminderId, snooze } from './reminderController.js';
import { dayEdit, entry } from './dailyController.js';
import { attachmentBody } from './attachmentController.js';

const opId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const base = { id: opId, createdAt: z.number().int().positive() };
const op = z.discriminatedUnion('kind', [
  // Offline creates always carry their own reminder id, so later queued ops can refer to it.
  z.object({ ...base, kind: z.literal('reminder.create'), data: create.extend({ id: reminderId }) }).strict(),
  z.object({ ...base, kind: z.literal('reminder.update'), reminderId, patch }).strict(),
  z.object({ ...base, kind: z.literal('reminder.complete'), reminderId }).strict(),
  z.object({ ...base, kind: z.literal('reminder.snooze'), reminderId, until: snooze.shape.until }).strict(),
  z.object({ ...base, kind: z.literal('reminder.archive'), reminderId, archived: z.boolean() }).strict(),
  // Queued by older app versions before deletion was removed; applied as an archive.
  z.object({ ...base, kind: z.literal('reminder.delete'), reminderId }).strict(),
  z.object({ ...base, kind: z.literal('daily.append'), date: dateParam, entry }).strict(),
  z.object({ ...base, kind: z.literal('attachment.put'), ...attachmentBody.shape }).strict(),
  z.object({ ...base, kind: z.literal('daily.replace'), date: dateParam, day: dayEdit }).strict(),
]);
const body = z.object({ ops: z.array(op).max(100) }).strict();

export function opsSyncRouter({ opsSync }) {
  const r = express.Router();
  r.post('/sync/ops', wrap(async (req, res) => {
    const { ops } = parse(body, req.body);
    res.json({ results: await opsSync.apply([...ops].sort((a, b) => a.createdAt - b.createdAt)) });
  }));
  return r;
}
