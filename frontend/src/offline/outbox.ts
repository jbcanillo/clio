import { getToken } from '../lib/api';
import { open, seal } from './crypto';

export interface NoteChange {
  id: string;
  path: string | null;
  title: string;
  body: string;
  baseHash: string | null;
  createdAt: number;
}
export interface SyncResult {
  id: string;
  status: 'applied' | 'duplicate' | 'conflict';
  path?: string;
  hash?: string;
  conflictPath?: string;
}
export type ConflictInfo = SyncResult & { mine: string; title: string };
export interface FlushResult {
  sent: number;
  conflicts: ConflictInfo[];
  failed: number;
  locked: boolean;
}
export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const PREFIX = 'change:';

interface Options {
  store: KeyValueStore;
  getKey: () => Promise<CryptoKey | null>;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

/** Offline notes waiting to be sent. Everything in the store is AES-GCM encrypted. */
export function createOutbox({ store, getKey, fetchFn = (u, i) => fetch(u, i) }: Options) {
  let flushing: Promise<FlushResult> | null = null;

  async function enqueue(change: NoteChange): Promise<void> {
    const key = await getKey();
    if (!key) throw new Error('locked');
    if ((await store.get(PREFIX + change.id)) !== undefined) return;
    await store.set(PREFIX + change.id, await seal(key, JSON.stringify(change)));
  }

  async function pending(): Promise<number> {
    return (await store.keys()).filter((k) => k.startsWith(PREFIX)).length;
  }

  async function run(): Promise<FlushResult> {
    const result: FlushResult = { sent: 0, conflicts: [], failed: 0, locked: false };
    const key = await getKey();
    const keys = (await store.keys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length === 0) return result;
    if (!key) return { ...result, locked: true };

    const changes: NoteChange[] = [];
    for (const k of keys) {
      try {
        changes.push(JSON.parse(await open(key, (await store.get(k)) as string)));
      } catch {
        return { ...result, locked: true }; // wrong passphrase: keep everything
      }
    }
    changes.sort((a, b) => a.createdAt - b.createdAt);

    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      let results: SyncResult[];
      try {
        const token = getToken();
        const res = await fetchFn('/api/sync/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session-Token': token } : {}) },
          body: JSON.stringify({ changes: [c] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        results = (await res.json()).results;
      } catch {
        result.failed = changes.length - i; // connection or server problem: stop, keep the rest
        return result;
      }
      const r = results[0];
      await store.delete(PREFIX + c.id);
      if (r.status === 'conflict' || (r.status === 'duplicate' && r.conflictPath)) {
        result.conflicts.push({ ...r, mine: c.body, title: c.title });
      } else {
        result.sent += 1;
      }
    }
    return result;
  }

  function flush(): Promise<FlushResult> {
    if (!flushing) flushing = run().finally(() => { flushing = null; });
    return flushing;
  }

  return { enqueue, pending, flush };
}
