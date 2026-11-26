import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

export const attachmentBody = z.object({
  file: z.string().max(60),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  data: z.string().max(6_000_000),
}).strict();

export function attachmentRouter({ attachments }) {
  const r = express.Router();
  r.post('/attachments', wrap(async (req, res) => {
    const out = await attachments.put(parse(attachmentBody, req.body));
    res.status(out.created ? 201 : 200).json({ file: out.file, path: out.path });
  }));
  // JSON (base64) rather than raw bytes: the app fetches with its session header and can cache it offline.
  r.get('/attachments/:file', wrap(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await attachments.get(req.params.file));
  }));
  return r;
}
