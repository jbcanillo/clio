const MEMORY_BACKENDS = ['basic-memory', 'plain'];

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Reads and validates configuration from environment variables. */
export function loadConfig(env = process.env) {
  if (!env.SECRET_KEY || env.SECRET_KEY.length < 32) {
    throw new Error('SECRET_KEY must be set and at least 32 characters long');
  }
  if (!env.CLIO_PASSWORD) throw new Error('CLIO_PASSWORD must be set');

  const memoryBackend = env.MEMORY_BACKEND || 'plain';
  if (!MEMORY_BACKENDS.includes(memoryBackend)) {
    throw new Error(`MEMORY_BACKEND must be one of: ${MEMORY_BACKENDS.join(', ')}`);
  }
  const timezone = env.TZ || 'UTC';
  if (!isValidTimezone(timezone)) throw new Error(`TZ is not a valid timezone: ${timezone}`);

  return {
    port: parseInt(env.API_PORT, 10) || 4000,
    vaultDir: env.VAULT_DIR || '/vault',
    dataDir: env.DATA_DIR || '/data',
    secretKey: env.SECRET_KEY,
    password: env.CLIO_PASSWORD,
    sessionTtlHours: parseInt(env.SESSION_TTL_HOURS, 10) || 8,
    openrouterApiKey: env.OPENROUTER_API_KEY || undefined,
    openrouterModel: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    openrouterBaseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
      subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
    },
    timezone,
    memoryBackend,
    basicMemoryUrl: env.BASIC_MEMORY_URL || 'http://basic-memory:8765/mcp',
  };
}
