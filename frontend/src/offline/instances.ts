import { ApiError, setReadThrough } from '../lib/api';
import { emitDataChanged, type DataKind } from '../lib/dataEvents';
import type { DaySummary, NoteSummary } from '../lib/types';
import { newUuid } from '../lib/uuid';
import { createOpsOutbox, type OpBody } from './opsOutbox';
import { createOutbox } from './outbox';
import { overlayDayDetail, overlayDays, overlayNoteRead, overlayNotes, overlayReminders } from './overlay';
import { createReadCache } from './readCache';
import { getSessionKey } from './session';
import { createIdbStore } from './store';

// Separate modules from offline/index so tests that mock '../offline' leave these real.
const queueStore = createIdbStore();
export const notesOutbox = createOutbox({ store: queueStore, getKey: getSessionKey });
export const opsOutbox = createOpsOutbox({ store: queueStore, getKey: getSessionKey });
export const readCache = createReadCache({ store: createIdbStore('clio-cache'), getKey: getSessionKey });

/** Asks the service worker to wake us when the connection returns (where Background Sync exists). */
export async function requestBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    await (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync?.register('clio-outbox');
  } catch { /* not supported: the 'online' event flushes instead */ }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** fetch() failing outright, or a proxy saying the server is unreachable. */
export function isConnectionError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  return e instanceof ApiError && (e.status === 502 || e.status === 503 || e.status === 504);
}

/**
 * Runs a write against the server; when there is no connection, queues it (encrypted) for the
 * next sync instead and returns `offlineResult()`. Errors the server reports are passed through.
 */
export async function writeOrQueue<T>(op: OpBody, online: () => Promise<T>, offlineResult: () => T | Promise<T>, kind: DataKind | null): Promise<T> {
  if (!isOffline()) {
    try {
      return await online();
    } catch (e) {
      if (!isConnectionError(e)) throw e;
    }
  }
  let queued = { ...op, id: newUuid(), createdAt: Date.now() } as Parameters<typeof opsOutbox.enqueue>[0];
  if (op.kind === 'daily.replace') {
    // A second offline edit of the same day replaces the first, and keeps the version it started from,
    // so the two don't conflict with each other when they sync.
    const prev = (await opsOutbox.list()).find((o) => o.kind === 'daily.replace' && o.date === op.date);
    if (prev && prev.kind === 'daily.replace') queued = { ...op, id: prev.id, createdAt: prev.createdAt, day: { ...op.day, baseHash: prev.day.baseHash } };
  }
  try {
    await opsOutbox.enqueue(queued);
  } catch (e) {
    if ((e as Error).message === 'locked') throw new Error("You're offline. Unlock Clio to save changes offline.");
    throw e;
  }
  void requestBackgroundSync();
  if (kind) emitDataChanged(kind);
  return await offlineResult();
}

/** Lowercase, server-compatible reminder id, so a create can be retried or queued safely. */
export function newReminderId(): string {
  return Date.now().toString(36) + newUuid().replace(/-/g, '').slice(0, 10);
}

const pathOnly = (p: string) => p.split('?')[0];

/** Layers queued changes over a GET response so offline edits show up everywhere. */
async function overlay(path: string, data: unknown): Promise<unknown> {
  const base = pathOnly(path);
  try {
    if (base === '/api/reminders' && Array.isArray(data)) {
      const ops = await opsOutbox.list();
      if (!ops.length) return data;
      const merged = overlayReminders(data, ops);
      // Respect a ?done= filter on the merged list.
      const done = new URLSearchParams(path.split('?')[1] ?? '').get('done');
      return done === null ? merged : merged.filter((r) => Boolean(r.done) === (done === 'true'));
    }
    if (base === '/api/daily' && Array.isArray(data)) {
      const ops = await opsOutbox.list();
      return ops.length ? overlayDays(data as DaySummary[], ops) : data;
    }
    if (/^\/api\/daily\/\d{4}-\d{2}-\d{2}$/.test(base) && data && typeof data === 'object') {
      const ops = await opsOutbox.list();
      return ops.length ? overlayDayDetail(data as Parameters<typeof overlayDayDetail>[0], ops) : data;
    }
    if (base === '/api/notes/read' && data && typeof data === 'object') {
      const queued = await notesOutbox.list();
      return queued.length ? overlayNoteRead(data as Parameters<typeof overlayNoteRead>[0], queued) : data;
    }
    if (base === '/api/notes' && Array.isArray(data)) {
      const queued = await notesOutbox.list();
      return queued.length ? overlayNotes(data as NoteSummary[], queued) : data;
    }
  } catch { /* the overlay is best effort: never break a read */ }
  return data;
}

/** Wires the encrypted read cache into apiFetch. Call once at startup. */
export function installReadThrough(): void {
  setReadThrough({
    fresh: async (path, data) => {
      void readCache.put(path, data).catch(() => {});
      return overlay(path, data);
    },
    offline: async (path) => {
      const hit = await readCache.get(path).catch(() => undefined);
      if (!hit) return undefined;
      return { data: await overlay(path, hit.data) };
    },
  });
}
