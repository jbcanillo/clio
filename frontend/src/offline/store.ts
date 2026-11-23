import { openDB } from 'idb';
import type { KeyValueStore } from './outbox';

/** IndexedDB-backed key/value store (opened lazily on first use). */
export function createIdbStore(name = 'clio-outbox'): KeyValueStore {
  const db = () => openDB(name, 1, { upgrade: (d) => { d.createObjectStore('kv'); } });
  return {
    get: async (k) => (await db()).get('kv', k),
    set: async (k, v) => { await (await db()).put('kv', v, k); },
    delete: async (k) => { await (await db()).delete('kv', k); },
    keys: async () => (await (await db()).getAllKeys('kv')) as string[],
  };
}
