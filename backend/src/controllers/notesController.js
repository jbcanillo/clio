import express from 'express';
import { wrap } from '../http.js';

export function notesRouter({ notes }) {
  const r = express.Router();
  r.get('/notes', wrap(async (_req, res) => res.json(await notes.list())));
  return r;
}
