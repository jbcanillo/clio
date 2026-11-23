import { z } from 'zod';
import { ValidationError } from './errors.js';
import { ConflictError, PathError } from './services/vaultService.js';

/** Express 4 does not catch rejected promises; this forwards them to the error handler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

export const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

/** Maps known error types to HTTP statuses; everything else is a generic 500. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ValidationError) return res.status(400).json({ error: 'invalid', message: err.message });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err?.code === 'not_found') return res.status(404).json({ error: 'not_found' });
  if (err?.code === 'conflict') return res.status(409).json({ error: 'conflict' });
  if (err?.code === 'parse_error') return res.status(409).json({ error: 'parse_error', message: err.message });
  if (err instanceof ConflictError) return res.status(409).json({ error: 'conflict' });
  if (err instanceof PathError) return res.status(400).json({ error: 'invalid_path' });
  console.error(err);
  return res.status(500).json({ error: 'internal' });
}
