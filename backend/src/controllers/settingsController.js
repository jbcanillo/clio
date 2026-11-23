import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM');
const patch = z.object({
  openrouterKey: z.string().max(500).optional(),
  openrouterModel: z.string().min(1).max(200).optional(),
  timezone: z.string().min(1).max(100).optional(),
  checkinTimes: z.object({ morning: time, evening: time }).optional(),
}).strict();

export function settingsRouter({ settings, fetchFn = fetch }) {
  const r = express.Router();
  r.get('/settings', (_req, res) => res.json(settings.getPublic()));
  r.put('/settings', wrap((req, res) => res.json(settings.update(parse(patch, req.body ?? {})))));
  r.post('/settings/test-key', wrap(async (_req, res) => {
    const key = settings.getOpenRouterKey();
    if (!key) return res.json({ ok: false, error: 'no_key' });
    try {
      const resp = await fetchFn('https://openrouter.ai/api/v1/auth/key', { headers: { Authorization: `Bearer ${key}` } });
      return res.json(resp.ok ? { ok: true } : { ok: false, error: `openrouter_${resp.status}` });
    } catch {
      return res.json({ ok: false, error: 'network' });
    }
  }));
  return r;
}
