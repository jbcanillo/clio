import { loadConfig } from '../config.js';

const good = { SECRET_KEY: 'k'.repeat(32), CLIO_PASSWORD: 'pw' };

describe('loadConfig', () => {
  it('throws when SECRET_KEY is shorter than 32 characters', () => {
    expect(() => loadConfig({ ...good, SECRET_KEY: 'k'.repeat(10) })).toThrow(/SECRET_KEY/);
  });
  it('throws when CLIO_PASSWORD is not set', () => {
    expect(() => loadConfig({ SECRET_KEY: good.SECRET_KEY })).toThrow(/CLIO_PASSWORD/);
  });
  it('applies defaults', () => {
    const c = loadConfig(good);
    expect(c.sessionTtlHours).toBe(8);
    expect(c.openrouterModel).toBe('openai/gpt-4o-mini');
    expect(c.memoryBackend).toBe('plain');
    expect(c.timezone).toBe('UTC');
    expect(c.vaultDir).toBe('/vault');
    expect(c.dataDir).toBe('/data');
  });
  it('defaults and overrides the OpenRouter base URL', () => {
    expect(loadConfig(good).openrouterBaseUrl).toBe('https://openrouter.ai/api/v1');
    expect(loadConfig({ ...good, OPENROUTER_BASE_URL: 'http://localhost:9/v1' }).openrouterBaseUrl).toBe('http://localhost:9/v1');
  });
  it('rejects an unknown MEMORY_BACKEND', () => {
    expect(() => loadConfig({ ...good, MEMORY_BACKEND: 'mem0' })).toThrow(/MEMORY_BACKEND/);
  });
  it('rejects an invalid TZ', () => {
    expect(() => loadConfig({ ...good, TZ: 'Mars/Phobos' })).toThrow(/TZ/);
  });
});
