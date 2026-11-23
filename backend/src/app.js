import express from 'express';
import cors from 'cors';

/**
 * Builds the Express app. Services are passed in through `deps` so tests can
 * inject fakes; later tasks add their services to this object.
 */
export function createApp(deps = {}) {
  const app = express();
  app.set('deps', deps);
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS, 10) || 1);

  const origins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : false;
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  return app;
}
