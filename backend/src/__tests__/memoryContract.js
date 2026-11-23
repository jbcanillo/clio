// Shared behaviour every MemoryService implementation must satisfy.
// `make()` returns { memory, vault, writeRaw } over a fresh empty vault.
export function runMemoryContract(name, make) {
  describe(`MemoryService contract: ${name}`, () => {
    let ctx;
    beforeEach(async () => { ctx = await make(); });

    const note = (rel, frontmatter, body) =>
      ctx.vault.write(rel, { frontmatter, body }, { expectedHash: null });

    it('finds a note by a word in its body', async () => {
      await note('Clio/Notes/garden.md', { title: 'Garden ideas' }, 'Plant tomatoes and basil near the south fence.');
      await ctx.memory.reindex();
      const hits = await ctx.memory.search('tomatoes');
      expect(hits.map((h) => h.path)).toContain('Clio/Notes/garden.md');
      expect(hits[0]).toMatchObject({ title: expect.any(String), snippet: expect.any(String), private: false });
    });

    it('never returns private notes unless includePrivate is true', async () => {
      await note('Clio/Daily/2026-11-20.md', { date: '2026-11-20', private: true }, '- anxious about the launch');
      await note('Clio/Notes/public.md', { title: 'Launch plan' }, 'The launch checklist');
      await ctx.memory.reindex();
      const hidden = await ctx.memory.search('launch');
      expect(hidden.every((h) => h.private === false)).toBe(true);
      expect(hidden.map((h) => h.path)).not.toContain('Clio/Daily/2026-11-20.md');
      const shown = await ctx.memory.search('anxious', { includePrivate: true });
      expect(shown.map((h) => h.path)).toContain('Clio/Daily/2026-11-20.md');
      expect(shown.find((h) => h.path === 'Clio/Daily/2026-11-20.md')).toMatchObject({ private: true, date: '2026-11-20' });
    });

    it('returns [] for a nonsense query and for an empty query', async () => {
      await note('Clio/Notes/a.md', {}, 'hello world');
      await ctx.memory.reindex();
      expect(await ctx.memory.search('xyzzyqq')).toEqual([]);
      expect(await ctx.memory.search('   ')).toEqual([]);
    });

    it('does not throw on a vault containing a file with broken frontmatter', async () => {
      ctx.writeRaw('Clio/Notes/broken.md', '---\n: bad: [yaml\n---\nbroken but searchable text\n');
      await note('Clio/Notes/ok.md', {}, 'fine text');
      await ctx.memory.reindex();
      await expect(ctx.memory.search('fine')).resolves.toBeInstanceOf(Array);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await note(`Clio/Notes/n${i}.md`, {}, 'common word');
      await ctx.memory.reindex();
      expect((await ctx.memory.search('common', { limit: 2 })).length).toBe(2);
    });
  });
}
