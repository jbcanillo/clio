import express from 'express';
import { z } from 'zod';
import { wrap, parse, dateParam } from '../http.js';

const range = z.object({ from: dateParam, to: dateParam });

export function analyticsRouter({ daily }) {
  const r = express.Router();
  r.get('/analytics/mood', wrap(async (req, res) => {
    const { from, to } = parse(range, req.query);
    res.json(await daily.moodSeries(from, to));
  }));
  return r;
}
