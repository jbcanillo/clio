import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { registerRoutes } from './routes.js';

const DEFAULT_LIMITS = { api: 300, copilot: 10, login: 5 }; // requests per minute per IP

const limiter = (max) =>
  rateLimit({
    windowMs: 60_000,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }),
  });

/** JSON body parsing with a size cap that depends on the route. */
function bodyParser() {
  const small = express.json({ limit: '1mb' });
  const copilot = express.json({ limit: '100kb' });
  const bulk = express.json({ limit: '5mb' });
  return (req, res, next) => {
    if (req.path.startsWith('/api/import')) return bulk(req, res, next);
    if (req.path.startsWith('/api/copilotkit')) return copilot(req, res, next);
    return small(req, res, next);
  };
}

/**
 * Builds the Express app. Services are passed in through `deps` so tests can
 * inject fakes; later tasks add their services to this object.
 */
export function createApp(deps = {}) {
  const app = express();
  const limits = { ...DEFAULT_LIMITS, ...deps.rateLimits };
  app.set('deps', deps);
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS, 10) || 1);
  app.use(helmet());

  const origins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : false;
  app.use(cors({ origin: origins }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth/login', limiter(limits.login));
  app.use('/api/copilotkit', limiter(limits.copilot));
  app.use('/api', limiter(limits.api));
  app.use(bodyParser());

  if (deps.auth) registerRoutes(app, deps);

  return app;
}
