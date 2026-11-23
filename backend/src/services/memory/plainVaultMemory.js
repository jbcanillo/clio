import MiniSearch from 'minisearch';

import { titleOf, dateOf, snippetOf } from './shared.js';

/** Full-text search over Clio/** in the vault. Index is rebuilt on reindex() or after ttlMs. */
export function createPlainVaultMemory({ vault, ttlMs = 2000, now = () => Date.now() }) {
  let index = null;
  let docs = new Map();
  let builtAt = 0;

  async function build() {
    const next = new MiniSearch({ fields: ['title', 'body'], searchOptions: { prefix: true, fuzzy: 0.15, boost: { title: 2 } } });
    const map = new Map();
    for (const path of await vault.list('Clio')) {
      const f = await vault.read(path);
      if (!f) continue;
      const doc = {
        id: path,
        path,
        title: titleOf(f),
        body: f.body,
        private: f.frontmatter.private === true,
        date: dateOf(f),
      };
      map.set(path, doc);
      next.add(doc);
    }
    index = next;
    docs = map;
    builtAt = now();
  }

  async function reindex() {
    await build();
  }

  async function search(query, { limit = 10, includePrivate = false } = {}) {
    if (typeof query !== 'string' || query.trim() === '') return [];
    if (!index || now() - builtAt > ttlMs) await build();
    return index
      .search(query)
      .map((r) => docs.get(r.id))
      .filter((d) => d && (includePrivate || !d.private))
      .slice(0, limit)
      .map((d, i, arr) => ({
        path: d.path,
        title: d.title,
        snippet: snippetOf(d.body, query),
        score: arr.length - i,
        private: d.private,
        ...(d.date ? { date: d.date } : {}),
      }));
  }

  return { search, reindex };
}
