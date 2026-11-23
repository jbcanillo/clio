import { makeVault } from './helpers/vault.js';
import { createPlainVaultMemory } from '../services/memory/plainVaultMemory.js';
import { runMemoryContract } from './memoryContract.js';

runMemoryContract('plain vault', async () => {
  const h = makeVault();
  return { ...h, memory: createPlainVaultMemory({ vault: h.vault }) };
});

describe('plain vault memory specifics', () => {
  it('picks up a file added after the first search once reindex() is called', async () => {
    const h = makeVault();
    const memory = createPlainVaultMemory({ vault: h.vault });
    expect(await memory.search('pineapple')).toEqual([]);
    await h.vault.write('Clio/Notes/p.md', { frontmatter: {}, body: 'pineapple' }, { expectedHash: null });
    await memory.reindex();
    expect((await memory.search('pineapple')).length).toBe(1);
  });
  it('builds a snippet around the match', async () => {
    const h = makeVault();
    const memory = createPlainVaultMemory({ vault: h.vault });
    await h.vault.write('Clio/Notes/long.md', { frontmatter: {}, body: `${'filler '.repeat(60)}needle ${'more '.repeat(60)}` }, { expectedHash: null });
    await memory.reindex();
    const [hit] = await memory.search('needle');
    expect(hit.snippet).toContain('needle');
    expect(hit.snippet.length).toBeLessThan(260);
  });
});
