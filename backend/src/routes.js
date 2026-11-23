import express from 'express';
import { requireAuth } from './middleware/auth.js';
import { loginHandler } from './controllers/authController.js';
import { settingsRouter } from './controllers/settingsController.js';
import { dailyRouter } from './controllers/dailyController.js';
import { reminderRouter } from './controllers/reminderController.js';
import { searchRouter } from './controllers/searchController.js';
import { analyticsRouter } from './controllers/analyticsController.js';
import { sessionRouter } from './controllers/sessionController.js';
import { pushRouter } from './controllers/pushController.js';
import { syncRouter } from './controllers/syncController.js';
import { errorHandler } from './http.js';
import { buildCopilotEndpoint } from './copilot/runtime.js';

/** Mounts every /api route. Later tasks add their routers below. */
export function registerRoutes(app, deps) {
  const api = express.Router();
  api.post('/auth/login', loginHandler(deps.auth));
  api.use(requireAuth(deps.auth));
  if (deps.shareSession) api.use(sessionRouter(deps));
  if (deps.sync) api.use(syncRouter(deps));
  if (deps.push && deps.scheduler && deps.config) api.use(pushRouter(deps));
  if (deps.settings) api.use(settingsRouter(deps));
  if (deps.daily) api.use(dailyRouter(deps));
  if (deps.reminders) api.use(reminderRouter(deps));
  if (deps.memory) api.use(searchRouter(deps));
  if (deps.daily) api.use(analyticsRouter(deps));
  if (deps.shareSession && deps.settings && deps.memory && deps.daily && deps.reminders) {
    api.use('/copilotkit', buildCopilotEndpoint(deps));
  }
  app.use('/api', api);
  app.use(errorHandler);
  return api;
}
