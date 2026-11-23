import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const body = z.object({
  reminders: z.array(z.record(z.unknown())).max(20000).default([]),
  journals: z.array(z.record(z.unknown())).max(20000).default([]),
});

export function importRouter({ importer, memory }) {
  const r = express.Router();
  r.post('/import/numdum', wrap(async (req, res) => {
    const result = await importer.importLegacy(parse(body, req.body));
    await memory?.reindex();
    res.json(result);
  }));
  return r;
}
