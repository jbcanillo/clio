import { createPlainVaultMemory } from './plainVaultMemory.js';
import { createBasicMemoryClient } from './basicMemoryClient.js';

/**
 * Picks the memory backend from config. If Basic Memory fails at call time the
 * plain vault search answers instead (and a warning is logged).
 */
export function createMemoryService(config, { vault, logger = console, createClient = createBasicMemoryClient }) {
  const plain = createPlainVaultMemory({ vault });
  if (config.memoryBackend !== 'basic-memory') return plain;

  const bm = createClient({ url: config.basicMemoryUrl, vault });
  return {
    async search(query, opts) {
      try {
        return await bm.search(query, opts);
      } catch (e) {
        logger.warn(`Basic Memory unavailable, using plain search: ${e.message}`);
        return plain.search(query, opts);
      }
    },
    async reindex() {
      await plain.reindex();
      await bm.reindex().catch(() => {});
    },
  };
}
