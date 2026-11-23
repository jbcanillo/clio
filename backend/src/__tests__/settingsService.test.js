import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSettingsService } from '../services/settingsService.js';

const secretKey = 'k'.repeat(32);
let dataDir;
beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-settings-')); });

describe('settingsService', () => {
  it('has defaults and reports the key as not set', () => {
    const s = createSettingsService({ dataDir, secretKey });
    expect(s.getPublic()).toEqual({
      openrouterKeySet: false,
      openrouterModel: 'openai/gpt-4o-mini',
      timezone: 'UTC',
      checkinTimes: { morning: '09:00', evening: '20:30' },
    });
  });
  it('stores the OpenRouter key encrypted and never exposes it', () => {
    const s = createSettingsService({ dataDir, secretKey });
    const pub = s.update({ openrouterKey: 'sk-or-123' });
    expect(pub.openrouterKeySet).toBe(true);
    expect(JSON.stringify(pub)).not.toContain('sk-or-123');
    expect(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).not.toContain('sk-or-123');
    expect(s.getOpenRouterKey()).toBe('sk-or-123');
  });
  it('persists across instances', () => {
    createSettingsService({ dataDir, secretKey }).update({ openrouterKey: 'sk-or-9', timezone: 'Asia/Manila' });
    const again = createSettingsService({ dataDir, secretKey });
    expect(again.getOpenRouterKey()).toBe('sk-or-9');
    expect(again.getPublic().timezone).toBe('Asia/Manila');
  });
  it('rejects invalid check-in times and timezones', () => {
    const s = createSettingsService({ dataDir, secretKey });
    expect(() => s.update({ checkinTimes: { morning: '25:00', evening: '20:30' } })).toThrow(/checkinTimes/);
    expect(() => s.update({ timezone: 'Mars/Phobos' })).toThrow(/timezone/);
  });
  it('falls back to the environment key when nothing is saved, and a saved key wins', () => {
    const s = createSettingsService({ dataDir, secretKey, envOpenRouterKey: 'sk-env' });
    expect(s.getOpenRouterKey()).toBe('sk-env');
    expect(s.getPublic().openrouterKeySet).toBe(true);
    s.update({ openrouterKey: 'sk-saved' });
    expect(s.getOpenRouterKey()).toBe('sk-saved');
  });
  it('can clear the saved key', () => {
    const s = createSettingsService({ dataDir, secretKey });
    s.update({ openrouterKey: 'sk-1' });
    s.update({ openrouterKey: '' });
    expect(s.getOpenRouterKey()).toBeUndefined();
  });
});
