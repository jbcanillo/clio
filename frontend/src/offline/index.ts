import { apiFetch } from '../lib/api';
import { emitDataChanged } from '../lib/dataEvents';
import { notesOutbox, opsOutbox, requestBackgroundSync } from './instances';
import type { FlushResult, NoteChange } from './outbox';
import { createNoteSaver } from './saveNote';

export { installReadThrough } from './instances';

let flushing: Promise<FlushResult> | null = null;
export const CONFLICTS_EVENT = 'clio:note-conflicts';

/** Both offline queues (new notes, and reminder/check-in changes) behind one flush/pending. */
export const outbox = {
  enqueue: notesOutbox.enqueue,
  async pending(): Promise<number> {
    const [a, b] = await Promise.all([notesOutbox.pending(), opsOutbox.pending()]);
    return a + b;
  },
  flush(): Promise<FlushResult> {
    if (!flushing) {
      flushing = (async () => {
        const notes = await notesOutbox.flush();
        const ops = await opsOutbox.flush();
        // Every open conflict list hears about conflicts, whoever triggered the flush.
        if (notes.conflicts.length && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CONFLICTS_EVENT, { detail: notes.conflicts }));
        return {
          sent: notes.sent + ops.sent,
          conflicts: notes.conflicts,
          failed: notes.failed + ops.failed,
          locked: notes.locked || ops.locked,
          rejected: ops.rejected,
        };
      })().finally(() => { flushing = null; });
    }
    return flushing;
  },
};

const save = createNoteSaver({
  outbox: notesOutbox,
  isOnline: () => navigator.onLine,
  post: async (c: NoteChange) => { await apiFetch('/api/sync/notes', { method: 'POST', json: { changes: [c] } }); },
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
});

/**
 * Saves an edit of an existing note (or of a new note still waiting to sync, path "pending:<id>").
 * Goes through the encrypted outbox like new notes, so it works offline; an edit made while the note
 * changed elsewhere is kept as a conflict copy for the owner to resolve.
 */
export async function editNote(note: { path: string; baseHash: string; title: string; body: string }): Promise<void> {
  const queued = await notesOutbox.list();
  if (note.path.startsWith('pending:')) {
    const id = note.path.slice('pending:'.length);
    const prev = queued.find((c) => c.id === id);
    if (!prev) throw new Error('That note has already synced. Reload and edit it again.');
    await notesOutbox.remove(id);
    await notesOutbox.enqueue({ ...prev, title: note.title, body: note.body });
  } else {
    // A second offline edit replaces the first and keeps the version it started from.
    const prev = queued.find((c) => c.path === note.path);
    if (prev) await notesOutbox.remove(prev.id);
    const change: NoteChange = { id: crypto.randomUUID(), path: note.path, title: note.title, body: note.body, baseHash: prev?.baseHash ?? note.baseHash, createdAt: Date.now() };
    try {
      await notesOutbox.enqueue(change);
    } catch (e) {
      if ((e as Error).message !== 'locked' || !navigator.onLine) throw e;
      await apiFetch('/api/sync/notes', { method: 'POST', json: { changes: [change] } }); // no key: send directly
      emitDataChanged('notes');
      return;
    }
  }
  emitDataChanged('notes');
  if (!navigator.onLine) {
    await requestBackgroundSync();
    return;
  }
  const r = await outbox.flush();
  if (r.conflicts.some((c) => c.path === note.path)) {
    throw new Error('This note changed somewhere else. Your version was kept as a copy: resolve it on the Chat tab.');
  }
}

/** A new note still waiting to sync ("pending:<id>"), read from the encrypted queue for editing. */
export async function queuedNote(path: string): Promise<{ title: string; body: string; hash: string }> {
  const id = path.slice('pending:'.length);
  const c = (await notesOutbox.list()).find((x) => x.id === id);
  if (!c) throw new Error('That note has already synced. Reload and edit it again.');
  return { title: c.title, body: c.body, hash: '' };
}

/** Saves a note and, if it had to be queued, asks the browser to sync it later. */
export async function saveNote(note: { title: string; body: string }): Promise<void> {
  await save(note);
  if (!navigator.onLine) await requestBackgroundSync();
}
