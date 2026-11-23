import type { NoteChange } from './outbox';

interface Deps {
  outbox: { enqueue(c: NoteChange): Promise<void>; flush(): Promise<unknown> };
  isOnline: () => boolean;
  post: (c: NoteChange) => Promise<void>;
  newId: () => string;
  now: () => number;
}

/**
 * Saves a new note: queue it (encrypted) and sync right away when online.
 * With no key (e.g. after a reload) it still works online by posting directly;
 * offline it fails with 'locked' so the owner knows to sign in again.
 */
export function createNoteSaver({ outbox, isOnline, post, newId, now }: Deps) {
  return async ({ title, body }: { title: string; body: string }): Promise<void> => {
    const change: NoteChange = { id: newId(), path: null, title, body, baseHash: null, createdAt: now() };
    try {
      await outbox.enqueue(change);
    } catch (e) {
      if ((e as Error).message === 'locked' && isOnline()) return post(change);
      throw e;
    }
    if (isOnline()) await outbox.flush();
  };
}
