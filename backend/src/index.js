import 'dotenv/config';
import fs from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createAuth } from './services/authService.js';
import { createSettingsService } from './services/settingsService.js';
import { createVaultService } from './services/vaultService.js';
import { createDailyService } from './services/dailyService.js';
import { createReminderService } from './services/reminderService.js';
import { createMemoryService } from './services/memory/index.js';
import { createShareSession } from './services/shareSession.js';

const config = loadConfig();
fs.mkdirSync(config.vaultDir, { recursive: true });

const settings = createSettingsService({
  dataDir: config.dataDir,
  secretKey: config.secretKey,
  envOpenRouterKey: config.openrouterApiKey,
  defaults: { openrouterModel: config.openrouterModel, timezone: config.timezone },
});
const auth = createAuth({ password: config.password, ttlHours: config.sessionTtlHours });
const vault = createVaultService({ vaultDir: config.vaultDir });
const daily = createDailyService({ vault });
const reminders = createReminderService({ vault });
const memory = createMemoryService(config, { vault });

const shareSession = createShareSession();

const app = createApp({ config, settings, auth, vault, daily, reminders, memory, shareSession });
app.listen(config.port, '0.0.0.0', () => console.log(`Clio API listening on ${config.port}`));
