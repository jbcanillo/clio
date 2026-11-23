import { createVaultService } from '../services/vaultService.js';
import { createBasicMemoryClient } from '../services/memory/basicMemoryClient.js';
import { runMemoryContract } from './memoryContract.js';

// Runs the shared contract against a live Basic Memory server. Skipped unless both are set:
//   BASIC_MEMORY_URL=http://127.0.0.1:8765/mcp  BASIC_MEMORY_VAULT=/path/served/by/basic-memory
if (process.env.BASIC_MEMORY_URL && process.env.BASIC_MEMORY_VAULT) {
  runMemoryContract('basic-memory (live)', async () => {
    const vault = createVaultService({ vaultDir: process.env.BASIC_MEMORY_VAULT });
    return { vault, memory: createBasicMemoryClient({ url: process.env.BASIC_MEMORY_URL, vault }), writeRaw: () => {} };
  });
} else {
  describe.skip('basic-memory (live)', () => it('needs BASIC_MEMORY_URL and BASIC_MEMORY_VAULT', () => {}));
}
