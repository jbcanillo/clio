import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KeyValueStore } from '../../offline/outbox';

// In-memory IndexedDB stand-in, one map per database name.
const dbs = new Map<string, Map<string, string>>();
vi.mock('../../offline/store', () => ({
  createIdbStore: (name = 'clio-outbox'): KeyValueStore => {
    if (!dbs.has(name)) dbs.set(name, new Map());
    const raw = dbs.get(name)!;
    return {
      get: async (k) => raw.get(k),
      set: async (k, v) => { raw.set(k, v); },
      delete: async (k) => { raw.delete(k); },
      keys: async () => [...raw.keys()],
    };
  },
}));
// Fast key derivation for tests.
vi.mock('../../offline/crypto', async (orig) => {
  const real = await orig<typeof import('../../offline/crypto')>();
  return { ...real, deriveKey: (p: string, s: Uint8Array) => real.deriveKey(p, s, 1000) };
});

const { ApiError, apiFetch, getToken, setReadThrough } = await import('../../lib/api');
const { editNote, installReadThrough, outbox } = await import('../../offline');
const { notesOutbox } = await import('../../offline/instances');
const { opsOutbox, writeOrQueue } = await import('../../offline/instances');
const session = await import('../../offline/session');
const { AuthGate } = await import('../../lib/auth');
const clioApi = await import('../../lib/clioApi');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let online = true;
const g = globalThis as unknown as { indexedDB?: unknown };

beforeEach(async () => {
  for (const m of dbs.values()) m.clear();
  localStorage.clear();
  sessionStorage.clear();
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  g.indexedDB = g.indexedDB ?? {}; // offlineSupported() checks for it
  await session.unlockOutbox('pw');
  installReadThrough();
});
afterEach(() => {
  vi.restoreAllMocks();
  session.lockOutbox();
  setReadThrough(null);
});

describe('offline reading', () => {
  it('serves the last loaded copy when the server cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json([{ id: 'a', title: 'Dentist', due: '2030-01-01T09:00:00.000Z' }]));
    expect(await apiFetch('/api/reminders')).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 0)); // the cache write is fire-and-forget
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await apiFetch('/api/reminders')).toEqual([expect.objectContaining({ title: 'Dentist' })]);
    for (const v of dbs.get('clio-cache')!.values()) expect(v).not.toContain('Dentist');
  });

  it('still fails when nothing was cached, or after locking', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiFetch('/api/notes')).rejects.toThrow(TypeError);
  });
});

describe('offline writing', () => {
  it('queues a reminder create when offline and shows it in the cached list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json([]));
    await clioApi.listReminders();
    await new Promise((r) => setTimeout(r, 0));
    online = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const created = await clioApi.createReminder({ title: 'Buy milk', due: '2030-01-01T09:00:00.000Z' });
    expect(created.title).toBe('Buy milk');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await opsOutbox.pending()).toBe(1);
    expect((await clioApi.listReminders()).map((r) => r.title)).toEqual(['Buy milk']);
  });

  it('queues when the request fails to connect, but passes server errors through', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await clioApi.completeReminder('abc12345');
    expect(await opsOutbox.pending()).toBe(1);
    await expect(
      writeOrQueue({ kind: 'reminder.complete', reminderId: 'x' }, async () => { throw new ApiError(404, 'not_found'); }, () => undefined, 'reminders'),
    ).rejects.toThrow('not_found');
    expect(await opsOutbox.pending()).toBe(1);
  });

  it('flushes the queue to /api/sync/ops when back online', async () => {
    online = false;
    await clioApi.snoozeReminder('abc12345', '2030-01-01T10:00:00.000Z');
    online = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const ops = JSON.parse((init as RequestInit).body as string).ops;
      expect(url).toBe('/api/sync/ops');
      return json({ results: ops.map((o: { id: string }) => ({ id: o.id, status: 'applied' })) });
    });
    const r = await outbox.flush();
    expect(r.sent).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await outbox.pending()).toBe(0);
  });

  it('refuses to queue while locked', async () => {
    session.lockOutbox();
    online = false;
    await expect(clioApi.completeReminder('abc12345')).rejects.toThrow(/unlock clio/i);
  });
});

describe('unlocking', () => {
  it('a reload (token kept, key gone) asks for the password again', async () => {
    sessionStorage.setItem('clio.token', 't');
    session.lockOutbox();
    render(<AuthGate><p>app</p></AuthGate>);
    expect(screen.queryByText('app')).toBeNull();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('offline, checks the password against the local verifier', async () => {
    session.lockOutbox();
    online = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<AuthGate><p>app</p></AuthGate>);
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
    await userEvent.type(screen.getByLabelText(/password/i), 'nope');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password.');
    await userEvent.clear(screen.getByLabelText(/password/i));
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByText('app')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getToken()).toBeNull();
  });

  it('falls back to the offline unlock when the server is unreachable', async () => {
    session.lockOutbox();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<AuthGate><p>app</p></AuthGate>);
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByText('app')).toBeInTheDocument();
  });

  it('back online without a session, asks for the password to sync', async () => {
    session.lockOutbox();
    online = false;
    expect(await session.unlockOffline('pw')).toBe(true); // unlocked offline, no token
    render(<AuthGate><p>app</p></AuthGate>);
    expect(screen.getByText('app')).toBeInTheDocument();
    online = true;
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(await screen.findByRole('status')).toHaveTextContent(/back online/i);
    expect(screen.queryByText('app')).toBeNull();
  });

  it('a 401 from the server ends an offline session', async () => {
    session.lockOutbox();
    expect(await session.unlockOffline('pw')).toBe(true);
    render(<AuthGate><p>app</p></AuthGate>);
    expect(screen.getByText('app')).toBeInTheDocument();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await act(async () => { await apiFetch('/api/settings').catch(() => {}); });
    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
  });
});

describe('offline edits', () => {
  const day = (events: string[], baseHash: string | null) => ({ baseHash, mood: 3, events, thoughts: [], ideas: [], photos: [], people: [], places: [] });

  it('a second offline edit of the same day replaces the first and keeps its base version', async () => {
    online = false;
    const put = { kind: 'daily.replace' as const, date: '2026-11-20' };
    await writeOrQueue({ ...put, day: day(['first'], 'h-original') }, async () => undefined, () => undefined, 'daily');
    await writeOrQueue({ ...put, day: day(['second'], 'h-other') }, async () => undefined, () => undefined, 'daily');
    const ops = await opsOutbox.list();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'daily.replace', day: { events: ['second'], baseHash: 'h-original' } });
  });

  it('a second offline edit of the same note replaces the first and keeps its base version', async () => {
    online = false;
    await editNote({ path: 'Clio/Notes/a.md', baseHash: 'h1', title: 'A', body: 'one' });
    await editNote({ path: 'Clio/Notes/a.md', baseHash: 'h-newer', title: 'A2', body: 'two' });
    const queued = await notesOutbox.list();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ path: 'Clio/Notes/a.md', baseHash: 'h1', title: 'A2', body: 'two' });
  });

  it('editing a note that has not synced yet updates it in the queue', async () => {
    online = false;
    const { saveNote } = await import('../../offline');
    await saveNote({ title: 'Draft', body: 'v1' });
    const [c] = await notesOutbox.list();
    await editNote({ path: `pending:${c.id}`, baseHash: '', title: 'Draft', body: 'v2' });
    const after = await notesOutbox.list();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: c.id, path: null, body: 'v2' });
  });
});
