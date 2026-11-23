import express from 'express';
import { z } from 'zod';
import { parse } from '../http.js';

const body = z.object({ on: z.boolean() }).strict();

/** "Share private diary entries with Clio for this session" toggle. Off for every new login. */
export function sessionRouter({ shareSession }) {
  const r = express.Router();
  r.get('/session/share', (req, res) => res.json({ on: shareSession.isEnabled(req.sessionToken) }));
  r.post('/session/share', (req, res) => {
    const { on } = parse(body, req.body);
    shareSession.set(req.sessionToken, on);
    res.json({ on });
  });
  return r;
}
