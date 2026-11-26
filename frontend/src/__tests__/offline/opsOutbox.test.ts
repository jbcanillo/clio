// @vitest-environment node
import { deriveKey } from '../../offline/crypto';
import { createOpsOutbox, type Op } from '../../offline/opsOutbox';
import type { KeyValueStore } from '../../offline/outbox';
import { overlayDays, overlayNotes, overlayReminders } from '../../offline/overlay';
import { createReadCache } from '../../offline/readCache';
import type { DaySummary } from '../../lib/types';

const salt = new Uint8Array(16).fill(3);
const key = await deriveKey('pw', salt, 1000);
const otherKey = await deriveKey('other', salt, 1000);

function memoryStore(): KeyValueStore & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    get: async (k) => raw.get(k),
    set: async (k, v) => { raw.set(k, v); },
    delete: async (k) => { raw.delete(k); },
    keys: async () => [...raw.keys()],
  };
}
const T = 1_700_000_000_000;
const create = (n: number): Op => ({ id: `op${n}`, createdAt: T + n, kind: 'reminder.create', data: { id: `rem${n}aaaaaaa`, title: `Secret ${n}`, due: '2030-01-01T09:00:00.000Z' } });
const results = (rs: unknown[]) => new Response(JSON.stringify({ results: rs }), { status: 200 });

describe('opsOutbox', () => {
  it('stores ops encrypted and lists them oldest first', async () => {
    const store = memoryStore();
    const ob = createOpsOutbox({ store, getKey: async () => key, fetchFn: vi.fn() });
    await ob.enqueue(create(2));
    await ob.enqueue(create(1));
    for (const v of store.raw.values()) expect(v).not.toContain('Secret');
    expect((await ob.list()).map((o) => o.id)).toEqual(['op1', 'op2']);
    expect(await ob.pending()).toBe(2);
  });

  it('refuses to queue while locked', async () => {
    const ob = createOpsOutbox({ store: memoryStore(), getKey: async () => null, fetchFn: vi.fn() });
    await expect(ob.enqueue(create(1))).rejects.toThrow('locked');
  });

  it('sends one batch and drops applied, duplicate and rejected ops', async () => {
    const fetchFn = vi.fn(async () => results([{ id: 'op1', status: 'applied' }, { id: 'op2', status: 'duplicate' }, { id: 'op3', status: 'rejected', code: 'not_found' }]));
    const ob = createOpsOutbox({ store: memoryStore(), getKey: async () => key, fetchFn });
    for (const n of [1, 2, 3]) await ob.enqueue(create(n));
    expect(await ob.flush()).toEqual({ sent: 2, rejected: 1, failed: 0, locked: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).ops).toHaveLength(3);
    expect(await ob.pending()).toBe(0);
  });

  it('keeps everything on a connection error or a 5xx/401', async () => {
    for (const fetchFn of [vi.fn(async () => { throw new TypeError('down'); }), vi.fn(async () => new Response('', { status: 503 })), vi.fn(async () => new Response('', { status: 401 }))]) {
      const ob = createOpsOutbox({ store: memoryStore(), getKey: async () => key, fetchFn });
      await ob.enqueue(create(1));
      expect((await ob.flush()).failed).toBe(1);
      expect(await ob.pending()).toBe(1);
    }
  });

  it('on a 400 batch, retries one by one and drops only the op the server refuses', async () => {
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      const ops = JSON.parse(init.body as string).ops as Op[];
      if (ops.length > 1 || ops[0].id === 'op2') return new Response('{"error":"invalid"}', { status: 400 });
      return results([{ id: ops[0].id, status: 'applied' }]);
    });
    const ob = createOpsOutbox({ store: memoryStore(), getKey: async () => key, fetchFn });
    for (const n of [1, 2, 3]) await ob.enqueue(create(n));
    expect(await ob.flush()).toMatchObject({ sent: 2, rejected: 1 });
    expect(await ob.pending()).toBe(0);
  });

  it('reports locked and sends nothing without the key', async () => {
    const store = memoryStore();
    await createOpsOutbox({ store, getKey: async () => key }).enqueue(create(1));
    const fetchFn = vi.fn();
    expect((await createOpsOutbox({ store, getKey: async () => null, fetchFn }).flush()).locked).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('readCache', () => {
  it('round-trips encrypted, and misses with another key or when locked', async () => {
    const store = memoryStore();
    const cache = createReadCache({ store, getKey: async () => key });
    await cache.put('/api/notes', [{ title: 'private thing' }]);
    for (const v of store.raw.values()) expect(v).not.toContain('private');
    expect((await cache.get('/api/notes'))?.data).toEqual([{ title: 'private thing' }]);
    expect(await createReadCache({ store, getKey: async () => otherKey }).get('/api/notes')).toBeUndefined();
    expect(await createReadCache({ store, getKey: async () => null }).get('/api/notes')).toBeUndefined();
  });
});

describe('overlays', () => {
  const base = [{ id: 'a', title: 'A', due: '2030-01-02T00:00:00.000Z', repeat: 'never', done: false, snoozedUntil: '2030-01-01T00:00:00.000Z' }];

  it('adds queued creates once, applies updates, snoozes, completes and deletes', () => {
    const ops: Op[] = [
      create(1),
      { id: 'u', createdAt: T + 2, kind: 'reminder.update', reminderId: 'a', patch: { title: 'A2', snoozedUntil: null } },
      { id: 's', createdAt: T + 3, kind: 'reminder.snooze', reminderId: 'rem1aaaaaaa', until: '2030-02-01T00:00:00.000Z' },
    ];
    const out = overlayReminders(base, [...ops, create(1)]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.id === 'a')).toMatchObject({ title: 'A2' });
    expect(out.find((r) => r.id === 'a')).not.toHaveProperty('snoozedUntil');
    expect(out.find((r) => r.id === 'rem1aaaaaaa')).toMatchObject({ snoozedUntil: '2030-02-01T00:00:00.000Z', pendingSync: true });
    expect(overlayReminders(base, [{ id: 'c', createdAt: T, kind: 'reminder.complete', reminderId: 'a' }])[0]).toMatchObject({ done: true });
    expect(overlayReminders(base, [{ id: 'd', createdAt: T, kind: 'reminder.delete', reminderId: 'a' }])).toEqual([]);
  });

  it('completing a repeating reminder moves its due date past now, and is idempotent', () => {
    const now = Date.parse('2030-01-05T12:00:00.000Z');
    const daily = [{ id: 'r', due: '2030-01-05T09:00:00.000Z', repeat: 'daily', done: false }];
    const op: Op = { id: 'c', createdAt: T, kind: 'reminder.complete', reminderId: 'r' };
    const once = overlayReminders(daily, [op], now);
    expect(once[0].due).toBe('2030-01-06T09:00:00.000Z');
    expect(overlayReminders(once, [op], now)[0].due).toBe('2030-01-06T09:00:00.000Z');
  });

  it('marks queued check-ins on their day', () => {
    const day: DaySummary = { date: '2026-11-20', mood: null, energy: null, headline: '', hasEntry: false, sections: { thoughts: 0, ideas: 0, events: 0 } };
    const [d] = overlayDays([day], [
      { id: 'm', createdAt: T, kind: 'daily.append', date: '2026-11-20', entry: { mood: 4 } },
      { id: 't', createdAt: T + 1, kind: 'daily.append', date: '2026-11-20', entry: { section: 'thoughts', text: 'Rainy walk' } },
    ]);
    expect(d).toMatchObject({ mood: 4, hasEntry: true, headline: 'Rainy walk', sections: { thoughts: 1 } });
  });

  it('puts queued new notes first', () => {
    const out = overlayNotes([{ path: 'Clio/Notes/x.md', title: 'X', tags: [], snippet: '', updated: '', hash: 'h', checklist: [] }], [
      { id: 'n1', path: null, title: 'Offline idea', body: 'body', baseHash: null, createdAt: T },
    ]);
    expect(out.map((n) => n.title)).toEqual(['Offline idea', 'X']);
    expect(out[0].path).toBe('pending:n1');
  });
});
