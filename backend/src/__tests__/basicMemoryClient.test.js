import { makeVault } from './helpers/vault.js';
import { createBasicMemoryClient, parseSearchText } from '../services/memory/basicMemoryClient.js';
import { createMemoryService } from '../services/memory/index.js';

describe('parseSearchText', () => {
  it('parses path, title and score from bm_search output', () => {
    const text = "Results for 'x' in project 'main':\n- Clio/Daily/2026-11-20.md | 2026-11-20 | score -0.000\n- Clio/Notes/garden-ideas.md | Garden ideas | score 1.5\n";
    expect(parseSearchText(text)).toEqual([
      { path: 'Clio/Daily/2026-11-20.md', title: '2026-11-20', score: -0 },
      { path: 'Clio/Notes/garden-ideas.md', title: 'Garden ideas', score: 1.5 },
    ]);
  });
  it('returns [] for "No results" and for garbage', () => {
    expect(parseSearchText("No results for 'zzz' in project 'main'.")).toEqual([]);
    expect(parseSearchText('')).toEqual([]);
  });
});

const reply = (text) => ({ content: [{ type: 'text', text }] });

describe('createBasicMemoryClient', () => {
  it('falls back from hybrid to text when hybrid times out', async () => {
    const h = makeVault();
    await h.vault.write('Clio/Notes/g.md', { frontmatter: { title: 'Garden' }, body: 'tomatoes here' }, { expectedHash: null });
    const modes = [];
    const callTool = async ({ arguments: a }) => {
      modes.push(a.mode);
      if (a.mode === 'hybrid') return new Promise(() => {}); // never resolves (model download blocked)
      return reply('- Clio/Notes/g.md | Garden | score 1');
    };
    const memory = createBasicMemoryClient({ url: 'x', vault: h.vault, hybridTimeoutMs: 20, timeoutMs: 200, connect: async () => ({ callTool }) });
    const hits = await memory.search('tomatoes');
    expect(modes).toEqual(['hybrid', 'text']);
    expect(hits).toMatchObject([{ path: 'Clio/Notes/g.md', title: 'Garden', private: false }]);
  });
  it('drops private notes unless includePrivate, and skips hits whose file is gone', async () => {
    const h = makeVault();
    await h.vault.write('Clio/Daily/2026-11-20.md', { frontmatter: { private: true, date: '2026-11-20' }, body: 'anxious' }, { expectedHash: null });
    const callTool = async () => reply('- Clio/Daily/2026-11-20.md | d | score 1\n- Clio/Notes/ghost.md | g | score 1');
    const memory = createBasicMemoryClient({ url: 'x', vault: h.vault, connect: async () => ({ callTool }) });
    expect(await memory.search('anxious')).toEqual([]);
    const shown = await memory.search('anxious', { includePrivate: true });
    expect(shown.map((x) => x.path)).toEqual(['Clio/Daily/2026-11-20.md']);
  });
  it('rejects when Basic Memory is unreachable', async () => {
    const h = makeVault();
    const memory = createBasicMemoryClient({ url: 'x', vault: h.vault, connect: async () => { throw new Error('ECONNREFUSED'); } });
    await expect(memory.search('a')).rejects.toThrow('ECONNREFUSED');
  });
  it('rejects hits whose path tries to leave the vault instead of reading outside it', async () => {
    const h = makeVault();
    const callTool = async () => reply('- ../../etc/passwd | x | score 1');
    const memory = createBasicMemoryClient({ url: 'x', vault: h.vault, connect: async () => ({ callTool }) });
    expect(await memory.search('root')).toEqual([]);
  });
});

describe('createMemoryService', () => {
  const cfg = (memoryBackend) => ({ memoryBackend, basicMemoryUrl: 'http://bm/mcp' });
  it('uses the plain implementation when configured so', async () => {
    const h = makeVault();
    await h.vault.write('Clio/Notes/a.md', { frontmatter: {}, body: 'hello' }, { expectedHash: null });
    const m = createMemoryService(cfg('plain'), { vault: h.vault, logger: { warn() {} } });
    expect((await m.search('hello')).length).toBe(1);
  });
  it('falls back to plain and logs a warning when Basic Memory fails', async () => {
    const h = makeVault();
    await h.vault.write('Clio/Notes/a.md', { frontmatter: {}, body: 'hello' }, { expectedHash: null });
    const warn = vi.fn();
    const failing = { search: async () => { throw new Error('down'); }, reindex: async () => {} };
    const m = createMemoryService(cfg('basic-memory'), { vault: h.vault, logger: { warn }, createClient: () => failing });
    expect((await m.search('hello')).length).toBe(1);
    expect(warn).toHaveBeenCalled();
  });
});
