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
  it('keeps a whole person line (name, phone and email) in the snippet', async () => {
    const h = makeVault();
    const memory = createPlainVaultMemory({ vault: h.vault });
    const body = `## Events\n- Had a long lunch with Maria at the new ramen place downtown, we talked about her new job at the bank and the trip to Cebu next month\n\n## People\n- Maria Santos · +63 917 555 1234 · maria.santos@example.com\n`;
    await h.vault.write('Clio/Daily/2026-11-20.md', { frontmatter: { private: true }, body }, { expectedHash: null });
    await memory.reindex();
    const [hit] = await memory.search('Maria email', { includePrivate: true });
    expect(hit.snippet).toContain('Maria Santos · +63 917 555 1234 · maria.santos@example.com');
    expect(hit.snippet).toContain('ramen place');
  });
  it("finds a reminder by its contact and shows the contact's phone and email", async () => {
    const h = makeVault();
    const memory = createPlainVaultMemory({ vault: h.vault });
    await h.vault.write('Clio/Reminders/r1.md', {
      frontmatter: { id: 'r1', title: 'Call the plumber', extras: { contact: { name: 'Jose Cruz', phone: '0917 111 2222', email: 'jose@plumb.ph' } } },
      body: '',
    }, { expectedHash: null });
    await memory.reindex();
    const [hit] = await memory.search('Jose');
    expect(hit).toMatchObject({ title: 'Call the plumber', snippet: 'Contact: Jose Cruz · 0917 111 2222 · jose@plumb.ph' });
  });
});
