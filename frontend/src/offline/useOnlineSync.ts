import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConflictInfo, FlushResult } from './outbox';

interface OutboxLike {
  flush(): Promise<FlushResult>;
  pending(): Promise<number>;
}

/** Flushes the outbox at startup, when the browser comes back online, and when the service worker asks. */
export function useOnlineSync(outbox: OutboxLike) {
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const alive = useRef(true);

  const flush = useCallback(async () => {
    const r = await outbox.flush().catch(() => null);
    const p = await outbox.pending().catch(() => 0);
    if (!alive.current) return;
    setPending(p);
    if (r?.conflicts.length) setConflicts((cur) => [...cur, ...r.conflicts.filter((c) => !cur.some((x) => x.id === c.id))]);
  }, [outbox]);

  useEffect(() => {
    alive.current = true;
    void flush();
    const onOnline = () => void flush();
    const onSw = (e: Event) => { if ((e as MessageEvent).data?.type === 'FLUSH_OUTBOX') void flush(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('clio-sw-message', onSw);
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    const relay = (e: MessageEvent) => window.dispatchEvent(new MessageEvent('clio-sw-message', { data: e.data }));
    sw?.addEventListener?.('message', relay);
    return () => {
      alive.current = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('clio-sw-message', onSw);
      sw?.removeEventListener?.('message', relay);
    };
  }, [flush]);

  const resolved = useCallback((id: string) => setConflicts((cur) => cur.filter((c) => c.id !== id)), []);
  return { pending, conflicts, flushNow: flush, resolved };
}
