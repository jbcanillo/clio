import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const subscription = z.object({
  endpoint: z.string().url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});
const unsubscribe = z.object({ endpoint: z.string().url().max(2000) });

export function pushRouter({ push, scheduler, config }) {
  const r = express.Router();
  r.get('/push/vapid-public-key', (_req, res) => res.json({ publicKey: config.vapid.publicKey }));
  r.post('/push/subscribe', wrap(async (req, res) => {
    await push.subscribe(parse(subscription, req.body));
    res.status(201).json({ ok: true });
  }));
  r.post('/push/unsubscribe', wrap(async (req, res) => {
    await push.unsubscribe(parse(unsubscribe, req.body).endpoint);
    res.status(204).end();
  }));
  r.post('/checkin/snooze', wrap(async (_req, res) => {
    await scheduler.snoozeToday();
    res.status(204).end();
  }));
  return r;
}
