import { apiFetch } from '../lib/api';
import { createOutbox, type NoteChange } from './outbox';
import { createNoteSaver } from './saveNote';
import { getSessionKey } from './session';
import { createIdbStore } from './store';

export const outbox = createOutbox({ store: createIdbStore(), getKey: getSessionKey });

const save = createNoteSaver({
  outbox,
  isOnline: () => navigator.onLine,
  post: async (c: NoteChange) => { await apiFetch('/api/sync/notes', { method: 'POST', json: { changes: [c] } }); },
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
});

/** Saves a note and, if it had to be queued, asks the browser to sync it later. */
export async function saveNote(note: { title: string; body: string }): Promise<void> {
  await save(note);
  if (!navigator.onLine) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync?.register('clio-outbox');
    } catch { /* Background Sync not supported: the 'online' event will flush instead */ }
  }
}
