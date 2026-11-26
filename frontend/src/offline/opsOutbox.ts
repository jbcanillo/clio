import { getToken } from '../lib/api';
import { emitDataChanged, type DataKind } from '../lib/dataEvents';
import { open, seal } from './crypto';
import type { KeyValueStore } from './outbox';

/** Reminder and check-in changes, in the shape POST /api/sync/ops expects. */
export type OpBody =
  | { kind: 'reminder.create'; data: Record<string, unknown> & { id: string; title: string; due: string } }
  | { kind: 'reminder.update'; reminderId: string; patch: Record<string, unknown> }
  | { kind: 'reminder.complete'; reminderId: string }
  | { kind: 'reminder.snooze'; reminderId: string; until: string }
  | { kind: 'reminder.archive'; reminderId: string; archived: boolean }
  /** Only ever read back from an older app's queue; the server archives it. Nothing creates it now. */
  | { kind: 'reminder.delete'; reminderId: string }
  | { kind: 'daily.append'; date: string; entry: DailyEntry }
  | { kind: 'attachment.put'; file: string; mime: string; data: string }
  | { kind: 'daily.replace'; date: string; day: DayEdit };
/** A whole day as edited (PUT /api/daily/:date); `baseHash` is the version the edit started from. */
export interface DayEdit {
  baseHash: string | null;
  mood: number | null;
  events: string[];
  thoughts: string[];
  ideas: string[];
  photos: string[];
  people: { name: string; phone?: string; email?: string }[];
  places: { lat: number; lng: number; label?: string }[];
}
export type DailyEntry =
  | { mood: number; energy?: number }
  | { section: 'thoughts' | 'ideas' | 'events'; text: string }
  | { photo: string }
  | { person: { name: string; phone?: string; email?: string } }
  | { place: { lat: number; lng: number; label?: string } };
export type Op = OpBody & { id: string; createdAt: number };

interface OpResult { id: string; status: 'applied' | 'duplicate' | 'rejected'; code?: string }
export interface OpsFlushResult { sent: number; rejected: number; failed: number; locked: boolean }

const PREFIX = 'op:';
const BATCH = 100;
/** Stay well under the server's 5 MB body limit (photos make ops large). */
const BATCH_BYTES = 3_000_000;
const kindOf = (op: Op): DataKind | null =>
  op.kind === 'daily.append' || op.kind === 'daily.replace' ? 'daily' : op.kind === 'attachment.put' ? null : 'reminders';

/** Splits the queue into batches by count and size, keeping order. */
function batches(ops: Op[]): Op[][] {
  const out: Op[][] = [];
  let cur: Op[] = [];
  let bytes = 0;
  for (const op of ops) {
    const size = JSON.stringify(op).length;
    if (cur.length && (cur.length >= BATCH || bytes + size > BATCH_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(op);
    bytes += size;
  }
  if (cur.length) out.push(cur);
  return out;
}

interface Options {
  store: KeyValueStore;
  getKey: () => Promise<CryptoKey | null>;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

/** Offline reminder and check-in changes waiting to be sent. Everything in the store is AES-GCM encrypted. */
export function createOpsOutbox({ store, getKey, fetchFn = (u, i) => fetch(u, i) }: Options) {
  let flushing: Promise<OpsFlushResult> | null = null;

  async function enqueue(op: Op): Promise<void> {
    const key = await getKey();
    if (!key) throw new Error('locked');
    await store.set(PREFIX + op.id, await seal(key, JSON.stringify(op)));
  }

  const opKeys = async () => (await store.keys()).filter((k) => k.startsWith(PREFIX));

  async function pending(): Promise<number> {
    return (await opKeys()).length;
  }

  /** Decrypted queue, oldest first; [] when locked or unreadable. */
  async function list(): Promise<Op[]> {
    const key = await getKey();
    if (!key) return [];
    const out: Op[] = [];
    for (const k of await opKeys()) {
      try {
        out.push(JSON.parse(await open(key, (await store.get(k)) as string)));
      } catch { /* sealed with another key: leave it for that key */ }
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  async function post(ops: Op[]): Promise<{ status: number; results?: OpResult[] }> {
    const token = getToken();
    const res = await fetchFn('/api/sync/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session-Token': token } : {}) },
      body: JSON.stringify({ ops }),
    });
    if (!res.ok) return { status: res.status };
    return { status: res.status, results: (await res.json()).results };
  }

  async function run(): Promise<OpsFlushResult> {
    const result: OpsFlushResult = { sent: 0, rejected: 0, failed: 0, locked: false };
    const keys = await opKeys();
    if (keys.length === 0) return result;
    if (!(await getKey())) return { ...result, locked: true };
    const ops = await list();
    const touched = new Set<DataKind>();

    const settle = async (op: Op, r: OpResult | undefined) => {
      if (!r) return;
      await store.delete(PREFIX + op.id);
      const k = kindOf(op);
      if (k) touched.add(k);
      if (r.status === 'rejected') result.rejected += 1;
      else result.sent += 1;
    };

    try {
      let i = 0;
      for (const chunk of batches(ops)) {
        let res: Awaited<ReturnType<typeof post>>;
        try {
          res = await post(chunk);
        } catch {
          result.failed = ops.length - i; // connection problem: stop, keep the rest
          return result;
        }
        if (res.status === 400) {
          // One malformed op must not block the queue forever: send them one by one, drop the ones refused.
          for (const op of chunk) {
            let one: Awaited<ReturnType<typeof post>>;
            try {
              one = await post([op]);
            } catch {
              result.failed = ops.length - ops.indexOf(op);
              return result;
            }
            if (one.status === 400) await settle(op, { id: op.id, status: 'rejected', code: 'invalid' });
            else if (one.results) await settle(op, one.results[0]);
            else {
              result.failed = ops.length - ops.indexOf(op);
              return result;
            }
          }
          i += chunk.length;
          continue;
        }
        if (!res.results) {
          result.failed = ops.length - i; // 401 / 5xx: keep everything for the next try
          return result;
        }
        const byId = new Map(res.results.map((r) => [r.id, r]));
        for (const op of chunk) await settle(op, byId.get(op.id));
        i += chunk.length;
      }
      return result;
    } finally {
      for (const k of touched) emitDataChanged(k);
    }
  }

  function flush(): Promise<OpsFlushResult> {
    if (!flushing) flushing = run().finally(() => { flushing = null; });
    return flushing;
  }

  return { enqueue, pending, list, flush };
}
