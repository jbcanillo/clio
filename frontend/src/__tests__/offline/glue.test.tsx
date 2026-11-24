import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNoteSaver } from '../../offline/saveNote';
import { useOnlineSync } from '../../offline/useOnlineSync';
import { ConflictList } from '../../components/ConflictList';

const apiFetch = vi.fn();
vi.mock('../../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));

function saverDeps(over: Record<string, unknown> = {}) {
  const outbox = { enqueue: vi.fn().mockResolvedValue(undefined), flush: vi.fn().mockResolvedValue({ sent: 1, conflicts: [], failed: 0, locked: false }), pending: vi.fn() };
  const post = vi.fn().mockResolvedValue(undefined);
  return { outbox, post, deps: { outbox, isOnline: () => true, post, newId: () => 'uuid-1', now: () => 1234, ...over } };
}

describe('createNoteSaver', () => {
  it('queues the note and flushes right away when online', async () => {
    const { outbox, deps } = saverDeps();
    await createNoteSaver(deps as never)({ title: 'T', body: 'B' });
    expect(outbox.enqueue).toHaveBeenCalledWith({ id: 'uuid-1', path: null, title: 'T', body: 'B', baseHash: null, createdAt: 1234 });
    expect(outbox.flush).toHaveBeenCalledTimes(1);
  });
  it('only queues when offline', async () => {
    const { outbox, deps } = saverDeps({ isOnline: () => false });
    await createNoteSaver(deps as never)({ title: 'T', body: 'B' });
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.flush).not.toHaveBeenCalled();
  });
  it('without a key but online, sends the note straight to the server', async () => {
    const { outbox, post, deps } = saverDeps();
    outbox.enqueue.mockRejectedValue(new Error('locked'));
    await createNoteSaver(deps as never)({ title: 'T', body: 'B' });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 'uuid-1', title: 'T' }));
  });
  it("emits 'notes' after posting straight to the server, but not when only queued offline", async () => {
    const kinds: string[] = [];
    const onChange = (e: Event) => kinds.push((e as CustomEvent).detail);
    window.addEventListener('clio:data-changed', onChange);
    try {
      const queued = saverDeps({ isOnline: () => false });
      await createNoteSaver(queued.deps as never)({ title: 'T', body: 'B' });
      expect(kinds).toEqual([]);
      const direct = saverDeps();
      direct.outbox.enqueue.mockRejectedValue(new Error('locked'));
      await createNoteSaver(direct.deps as never)({ title: 'T', body: 'B' });
      expect(kinds).toEqual(['notes']);
      const failing = saverDeps();
      failing.outbox.enqueue.mockRejectedValue(new Error('locked'));
      failing.post.mockRejectedValue(new Error('HTTP 500'));
      await expect(createNoteSaver(failing.deps as never)({ title: 'T', body: 'B' })).rejects.toThrow('HTTP 500');
      expect(kinds).toEqual(['notes']);
    } finally {
      window.removeEventListener('clio:data-changed', onChange);
    }
  });
  it('without a key and offline, rejects so the form can ask the owner to sign in again', async () => {
    const { outbox, deps } = saverDeps({ isOnline: () => false });
    outbox.enqueue.mockRejectedValue(new Error('locked'));
    await expect(createNoteSaver(deps as never)({ title: 'T', body: 'B' })).rejects.toThrow('locked');
  });
});

function Probe({ outbox }: { outbox: { flush: () => Promise<unknown>; pending: () => Promise<number> } }) {
  const { pending, conflicts } = useOnlineSync(outbox as never);
  return <p>pending:{pending} conflicts:{conflicts.length}</p>;
}

describe('useOnlineSync', () => {
  it('flushes on mount, on the online event and when the service worker asks', async () => {
    const outbox = { flush: vi.fn().mockResolvedValue({ sent: 0, conflicts: [{ id: 'c' }], failed: 0, locked: false }), pending: vi.fn().mockResolvedValue(2) };
    render(<Probe outbox={outbox} />);
    await waitFor(() => expect(outbox.flush).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/pending:2 conflicts:1/)).toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(outbox.flush).toHaveBeenCalledTimes(2));
    await act(async () => { window.dispatchEvent(new MessageEvent('clio-sw-message', { data: { type: 'FLUSH_OUTBOX' } })); });
    await waitFor(() => expect(outbox.flush).toHaveBeenCalledTimes(3));
  });
});

describe('ConflictList', () => {
  const conflict = { id: 'c1', status: 'conflict' as const, path: 'Clio/Notes/a.md', conflictPath: 'Clio/Notes/a.conflict-c1.md', mine: 'phone edit', title: 'A' };
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (p: string) => (p.startsWith('/api/notes/read') ? { path: 'Clio/Notes/a.md', body: 'server edit', hash: 'h' } : { ok: true }));
  });
  it('shows both versions and resolves with the chosen side', async () => {
    const onResolved = vi.fn();
    render(<ConflictList conflicts={[conflict]} onResolved={onResolved} />);
    expect(await screen.findByText('server edit')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /keep mine/i }));
    expect(apiFetch).toHaveBeenCalledWith('/api/sync/resolve', { method: 'POST', json: { path: 'Clio/Notes/a.md', conflictPath: 'Clio/Notes/a.conflict-c1.md', choice: 'mine' } });
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('c1'));
  });
  it('shows an error and keeps the card when resolving fails', async () => {
    apiFetch.mockImplementation(async (p: string) => { if (p.startsWith('/api/sync/resolve')) throw new Error('x'); return { body: 'server edit' }; });
    const onResolved = vi.fn();
    render(<ConflictList conflicts={[conflict]} onResolved={onResolved} />);
    await userEvent.click(await screen.findByRole('button', { name: /keep both/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
