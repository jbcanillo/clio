import { open, seal } from './crypto';
import type { KeyValueStore } from './outbox';

const PREFIX = 'get:';

/** Last successful GET response per API path, AES-GCM encrypted with the session key. */
export function createReadCache({ store, getKey }: { store: KeyValueStore; getKey: () => Promise<CryptoKey | null> }) {
  async function put(path: string, data: unknown): Promise<void> {
    const key = await getKey();
    if (!key) return;
    await store.set(PREFIX + path, await seal(key, JSON.stringify({ at: Date.now(), data })));
  }

  /** undefined when nothing is cached, the app is locked, or the copy was sealed with another key. */
  async function get<T = unknown>(path: string): Promise<{ at: number; data: T } | undefined> {
    const key = await getKey();
    if (!key) return undefined;
    const sealed = await store.get(PREFIX + path);
    if (sealed === undefined) return undefined;
    try {
      return JSON.parse(await open(key, sealed));
    } catch {
      return undefined;
    }
  }

  return { put, get };
}
