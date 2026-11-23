// @vitest-environment node
import { createOutbox, type KeyValueStore, type NoteChange } from '../../offline/outbox';
import { deriveKey, open, seal } from '../../offline/crypto';

const salt = new Uint8Array(16).fill(7);
const key = await deriveKey('correct horse', salt, 1000);
const otherKey = await deriveKey('wrong passphrase', salt, 1000);

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
const change = (n: number, over: Partial<NoteChange> = {}): NoteChange => ({
  id: `id-${n}`, path: null, title: `Note ${n}`, body: `secret body ${n}`, baseHash: null, createdAt: 1_700_000_000_000 + n, ...over,
});
const ok = (results: unknown[]) => new Response(JSON.stringify({ results }), { status: 200 });

describe('crypto', () => {
  it('round-trips, never exposes plaintext, and refuses the wrong key', async () => {
    const sealed = await seal(key, 'my diary');
    expect(sealed).not.toContain('diary');
    expect(await open(key, sealed)).toBe('my diary');
    await expect(open(otherKey, sealed)).rejects.toThrow();
  });
});

describe('outbox', () => {
  it('stores changes encrypted: no raw value contains the plaintext', async () => {
    const store = memoryStore();
    const outbox = createOutbox({ store, getKey: async () => key, fetchFn: vi.fn() });
    await outbox.enqueue(change(1));
    expect(store.raw.size).toBe(1);
    for (const v of store.raw.values()) { expect(v).not.toContain('secret body'); expect(v).not.toContain('Note 1'); }
    expect(await outbox.pending()).toBe(1);
  });
  it('never enqueues the same change id twice', async () => {
    const outbox = createOutbox({ store: memoryStore(), getKey: async () => key, fetchFn: vi.fn() });
    await outbox.enqueue(change(1));
    await outbox.enqueue(change(1));
    expect(await outbox.pending()).toBe(1);
  });
  it('sends one change per request, oldest first, and clears applied ones', async () => {
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      const id = JSON.parse(init.body as string).changes[0].id;
      return ok([{ id, status: 'applied', path: 'Clio/Notes/x.md', hash: 'h' }]);
    });
    const outbox = createOutbox({ store: memoryStore(), getKey: async () => key, fetchFn });
    await outbox.enqueue(change(2));
    await outbox.enqueue(change(1));
    const r = await outbox.flush();
    expect(r).toMatchObject({ sent: 2, failed: 0, locked: false, conflicts: [] });
    expect(fetchFn.mock.calls.map(([u]) => u)).toEqual(['/api/sync/notes', '/api/sync/notes']);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body as string).changes[0].id).toBe('id-1');
    expect(await outbox.pending()).toBe(0);
  });
  it('when the connection drops mid-flush the rest stay queued', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      if (++calls === 2) throw new TypeError('Failed to fetch');
      const id = JSON.parse(init.body as string).changes[0].id;
      return ok([{ id, status: 'applied', path: 'p', hash: 'h' }]);
    });
    const outbox = createOutbox({ store: memoryStore(), getKey: async () => key, fetchFn });
    for (const n of [1, 2, 3]) await outbox.enqueue(change(n));
    const r = await outbox.flush();
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(2);
    expect(await outbox.pending()).toBe(2);
  });
  it('keeps the queue when the server answers 500', async () => {
    const outbox = createOutbox({ store: memoryStore(), getKey: async () => key, fetchFn: async () => new Response('{}', { status: 500 }) });
    await outbox.enqueue(change(1));
    expect(await outbox.flush()).toMatchObject({ sent: 0, failed: 1 });
    expect(await outbox.pending()).toBe(1);
  });
  it('is locked, and deletes nothing, when there is no key', async () => {
    const store = memoryStore();
    const withKey = createOutbox({ store, getKey: async () => key, fetchFn: vi.fn() });
    await withKey.enqueue(change(1));
    const locked = createOutbox({ store, getKey: async () => null, fetchFn: vi.fn() });
    expect(await locked.flush()).toMatchObject({ locked: true, sent: 0 });
    await expect(locked.enqueue(change(2))).rejects.toThrow('locked');
    expect(await withKey.pending()).toBe(1);
  });
  it('is locked, and deletes nothing, with the wrong passphrase key', async () => {
    const store = memoryStore();
    await createOutbox({ store, getKey: async () => key, fetchFn: vi.fn() }).enqueue(change(1));
    const wrong = createOutbox({ store, getKey: async () => otherKey, fetchFn: vi.fn() });
    expect(await wrong.flush()).toMatchObject({ locked: true });
    expect(await wrong.pending()).toBe(1);
  });
  it('returns conflicts with the local text and does not count them as sent', async () => {
    const fetchFn = async () => ok([{ id: 'id-1', status: 'conflict', path: 'Clio/Notes/a.md', hash: 'h', conflictPath: 'Clio/Notes/a.conflict-id-1.md' }]);
    const outbox = createOutbox({ store: memoryStore(), getKey: async () => key, fetchFn });
    await outbox.enqueue(change(1, { path: 'Clio/Notes/a.md', baseHash: 'b'.repeat(64) }));
    const r = await outbox.flush();
    expect(r.sent).toBe(0);
    expect(r.conflicts).toEqual([expect.objectContaining({ id: 'id-1', conflictPath: 'Clio/Notes/a.conflict-id-1.md', mine: 'secret body 1', title: 'Note 1' })]);
    expect(await outbox.pending()).toBe(0);
  });
  it('treats a duplicate that carries a conflictPath as a conflict (lost response replay)', async () => {
    const fetchFn = async () => ok([{ id: 'id-1', status: 'duplicate', path: 'p', conflictPath: 'c' }]);
    const outbox = createOutbox({ store: memoryStore(), getKey: async () => key, fetchFn });
    await outbox.enqueue(change(1));
    expect((await outbox.flush()).conflicts).toHaveLength(1);
  });
});
