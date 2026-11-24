import { useEffect, useState } from 'react';

export type DataKind = 'reminders' | 'notes' | 'daily';
export const DATA_CHANGED_EVENT = 'clio:data-changed';

export function emitDataChanged(kind: DataKind | 'all'): void {
  if (typeof window === 'undefined') return; // e.g. the outbox running under a node test environment
  window.dispatchEvent(new CustomEvent<DataKind | 'all'>(DATA_CHANGED_EVENT, { detail: kind }));
}

/** Counter that increments whenever the given kind (or 'all') is emitted. */
export function useDataVersion(kind: DataKind): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const k = (e as CustomEvent<DataKind | 'all'>).detail;
      if (k === kind || k === 'all') setVersion(v => v + 1);
    };
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [kind]);
  return version;
}
