import express from 'express';
import { requireAuth } from './middleware/auth.js';
import { loginHandler } from './controllers/authController.js';

/** Mounts every /api route. Later tasks register their routers on `api`. */
export function registerRoutes(app, deps) {
  const api = express.Router();
  api.post('/auth/login', loginHandler(deps.auth));
  api.use(requireAuth(deps.auth));
  app.use('/api', api);
  return api;
}
