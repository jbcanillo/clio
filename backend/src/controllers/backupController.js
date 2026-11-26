import express from 'express';
import { z } from 'zod';
import { wrap, parse } from '../http.js';

const filesBody = z.object({
  files: z.array(z.object({ path: z.string().max(500), data: z.string() }).strict()).min(1).max(1000),
}).strict();
const finishBody = z.object({
  keep: z.array(z.string().max(500)).max(200_000),
  archiveMissing: z.boolean(),
}).strict();

/**
 * Backup is a POST so the app's offline read cache never keeps a copy of the whole vault.
 * Restore runs in batches (files, then finish) so large photo libraries fit the body limit;
 * nothing is archived until every batch has been written, and nothing is ever deleted.
 */
export function backupRouter({ backup, memory }) {
  const r = express.Router();
  r.post('/backup/export', wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await backup.exportAll());
  }));
  r.post('/backup/restore/files', wrap(async (req, res) => {
    res.json(await backup.writeFiles(parse(filesBody, req.body).files));
  }));
  r.post('/backup/restore/finish', wrap(async (req, res) => {
    const { keep, archiveMissing } = parse(finishBody, req.body);
    const out = archiveMissing ? await backup.archiveMissing(keep) : { archived: 0 };
    await memory?.reindex();
    res.json(out);
  }));
  return r;
}
