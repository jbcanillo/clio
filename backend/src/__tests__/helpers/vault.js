import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVaultService } from '../../services/vaultService.js';

/** Creates an empty temp vault and returns { vault, root, write(rel, raw) }. */
export function makeVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-test-vault-'));
  const vault = createVaultService({ vaultDir: root });
  const writeRaw = (rel, raw) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), raw);
  };
  return { vault, root, writeRaw };
}
