import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { titleOf, dateOf, snippetOf } from './shared.js';

const HIT_LINE = /^\s*-\s+(.+?)\s+\|\s+(.*?)\s+\|\s+score\s+(-?[\d.]+)\s*$/;

/** Parses bm_search's plain-text result ("- path | title | score n" per line). */
export function parseSearchText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.match(HIT_LINE))
    .filter(Boolean)
    .map((m) => ({ path: m[1], title: m[2], score: Number(m[3]) }));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function defaultConnect(url) {
  const client = new Client({ name: 'clio', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

/**
 * MemoryService backed by a Basic Memory MCP server (streamable-http).
 * Tries `hybrid` search first and falls back to `text` if it is slow or fails,
 * so a blocked embedding-model download degrades to keyword search.
 */
export function createBasicMemoryClient({
  url,
  vault,
  project = 'main',
  timeoutMs = 8000,
  hybridTimeoutMs = 4000,
  connect = defaultConnect,
}) {
  let conn = null;
  const getConn = async () => {
    if (!conn) conn = await connect(url);
    return conn;
  };

  async function call(mode, query, ms) {
    const c = await getConn();
    try {
      const res = await withTimeout(c.callTool({ name: 'bm_search', arguments: { query, project, mode } }), ms, `bm_search(${mode})`);
      return res?.content?.[0]?.text ?? '';
    } catch (e) {
      conn = null; // reconnect next time
      throw e;
    }
  }

  async function search(query, { limit = 10, includePrivate = false } = {}) {
    if (typeof query !== 'string' || query.trim() === '') return [];
    let text;
    try {
      text = await call('hybrid', query, hybridTimeoutMs);
    } catch {
      text = await call('text', query, timeoutMs);
    }
    const out = [];
    for (const raw of parseSearchText(text)) {
      let file;
      try {
        file = await vault.read(raw.path);
      } catch {
        continue; // path outside the vault or unreadable: ignore the hit
      }
      if (!file) continue;
      const isPrivate = file.frontmatter.private === true;
      if (isPrivate && !includePrivate) continue;
      const date = dateOf(file);
      out.push({
        path: raw.path,
        title: titleOf(file),
        snippet: snippetOf(file.body, query),
        score: raw.score,
        private: isPrivate,
        ...(date ? { date } : {}),
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  // Basic Memory keeps its own index in sync with the files.
  const reindex = async () => {};

  return { search, reindex };
}
