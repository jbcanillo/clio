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

const MODELS_TTL_MS = 10 * 60 * 1000;

/** OpenRouter catalog entry -> what the Settings picker needs. Free = zero prompt and completion price. */
const toPickerModel = (m) => ({
  id: m.id,
  name: m.name || m.id,
  free: Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0,
  context: m.context_length ?? null,
});

export function settingsRouter({ settings, fetchFn = fetch, now = () => Date.now() }) {
  const r = express.Router();
  let modelsCache = null; // { at, models }

  // Models Clio can use: OpenRouter's catalog filtered to those that support tool calling. Free first, then by name.
  r.get('/settings/models', wrap(async (_req, res) => {
    if (modelsCache && now() - modelsCache.at < MODELS_TTL_MS) return res.json({ models: modelsCache.models });
    const key = settings.getOpenRouterKey();
    try {
      const resp = await fetchFn('https://openrouter.ai/api/v1/models', { headers: key ? { Authorization: `Bearer ${key}` } : {} });
      if (!resp.ok) return res.status(502).json({ error: `openrouter_${resp.status}` });
      const list = (await resp.json())?.data ?? [];
      const models = list
        .filter((m) => (m.supported_parameters ?? []).includes('tools'))
        .map(toPickerModel)
        .sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
      modelsCache = { at: now(), models };
      return res.json({ models });
    } catch {
      return res.status(502).json({ error: 'network' });
    }
  }));

  r.get('/settings', (_req, res) => res.json(settings.getPublic()));
  r.put('/settings', wrap((req, res) => res.json(settings.update(parse(patch, req.body ?? {})))));
  // Checks the key, then that the configured model exists and can call tools (Clio's chat needs both).
  r.post('/settings/test-key', wrap(async (_req, res) => {
    const key = settings.getOpenRouterKey();
    if (!key) return res.json({ ok: false, error: 'no_key' });
    const headers = { Authorization: `Bearer ${key}` };
    try {
      const resp = await fetchFn('https://openrouter.ai/api/v1/auth/key', { headers });
      if (!resp.ok) return res.json({ ok: false, error: `openrouter_${resp.status}` });
    } catch {
      return res.json({ ok: false, error: 'network' });
    }
    const model = settings.getPublic().openrouterModel;
    try {
      const resp = await fetchFn('https://openrouter.ai/api/v1/models', { headers });
      if (!resp.ok) return res.json({ ok: true, model }); // key is fine; the model list is best effort
      const list = (await resp.json())?.data ?? [];
      const found = list.find((m) => m.id === model);
      if (!found) return res.json({ ok: false, error: 'model_not_found', model });
      if (!(found.supported_parameters ?? []).includes('tools')) return res.json({ ok: false, error: 'model_no_tools', model });
      return res.json({ ok: true, model });
    } catch {
      return res.json({ ok: true, model });
    }
  }));
  return r;
}
