import fs from 'node:fs';
import path from 'node:path';
import { encryptString, decryptString } from './cryptoService.js';
import { isValidTimezone } from '../config.js';

const DEFAULTS = {
  openrouterModel: 'openai/gpt-4o-mini',
  timezone: 'UTC',
  checkinTimes: { morning: '09:00', evening: '20:30' },
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Owner settings stored in <dataDir>/settings.json; the OpenRouter key is encrypted. */
export function createSettingsService({ dataDir, secretKey, envOpenRouterKey, defaults = {} }) {
  const file = path.join(dataDir, 'settings.json');
  fs.mkdirSync(dataDir, { recursive: true });

  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };

  const getOpenRouterKey = () => {
    const saved = load().openrouterKeyEnc;
    if (saved) return decryptString(saved, secretKey);
    return envOpenRouterKey || undefined;
  };

  const getPublic = () => {
    const s = load();
    return {
      openrouterKeySet: Boolean(getOpenRouterKey()),
      openrouterModel: s.openrouterModel || defaults.openrouterModel || DEFAULTS.openrouterModel,
      timezone: s.timezone || defaults.timezone || DEFAULTS.timezone,
      checkinTimes: s.checkinTimes || DEFAULTS.checkinTimes,
    };
  };

  const update = (patch = {}) => {
    const s = load();
    if (patch.timezone !== undefined) {
      if (!isValidTimezone(patch.timezone)) throw new Error('timezone is not valid');
      s.timezone = patch.timezone;
    }
    if (patch.checkinTimes !== undefined) {
      const { morning, evening } = patch.checkinTimes || {};
      if (!HHMM.test(morning || '') || !HHMM.test(evening || '')) {
        throw new Error('checkinTimes must be HH:MM (24h) for morning and evening');
      }
      s.checkinTimes = { morning, evening };
    }
    if (patch.openrouterModel !== undefined) s.openrouterModel = String(patch.openrouterModel);
    if (patch.openrouterKey !== undefined) {
      if (patch.openrouterKey === '') delete s.openrouterKeyEnc;
      else s.openrouterKeyEnc = encryptString(patch.openrouterKey, secretKey);
    }
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return getPublic();
  };

  return { getPublic, update, getOpenRouterKey };
}
