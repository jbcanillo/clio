import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createAuth } from './services/authService.js';
import { createSettingsService } from './services/settingsService.js';

const config = loadConfig();
const settings = createSettingsService({
  dataDir: config.dataDir,
  secretKey: config.secretKey,
  envOpenRouterKey: config.openrouterApiKey,
  defaults: { openrouterModel: config.openrouterModel, timezone: config.timezone },
});
const auth = createAuth({ password: config.password, ttlHours: config.sessionTtlHours });

const app = createApp({ config, settings, auth });
app.listen(config.port, '0.0.0.0', () => console.log(`Clio API listening on ${config.port}`));
