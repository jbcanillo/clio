import request from 'supertest';
import { createApp } from '../../app.js';
import { createAuth } from '../../services/authService.js';
import { createDailyService } from '../../services/dailyService.js';
import { createReminderService } from '../../services/reminderService.js';
import { createPlainVaultMemory } from '../../services/memory/plainVaultMemory.js';
import { createSettingsService } from '../../services/settingsService.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeVault } from './vault.js';

/** Full app over a temp vault; returns helpers that already carry a valid session token. */
export async function makeApi(extra = {}) {
  const h = makeVault();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-data-'));
  const secretKey = 'k'.repeat(32);
  const auth = createAuth({ password: 'pw', ttlHours: 8 });
  const settings = createSettingsService({ dataDir, secretKey });
  const daily = createDailyService({ vault: h.vault });
  const reminders = createReminderService({ vault: h.vault });
  const memory = createPlainVaultMemory({ vault: h.vault });
  const deps = { auth, settings, daily, reminders, memory, vault: h.vault, config: { timezone: 'UTC' }, ...extra };
  const app = createApp(deps);
  const { body } = await request(app).post('/api/auth/login').send({ password: 'pw' });
  const token = body.token;
  const as = (method, url) => request(app)[method](url).set('X-Session-Token', token);
  return { app, token, as, h, deps, dataDir };
}
