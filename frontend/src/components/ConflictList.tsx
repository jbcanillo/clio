import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { ConflictInfo } from '../offline/outbox';
import { ConflictCard } from './gen/ConflictCard';

function ConflictItem({ c, onResolved }: { c: ConflictInfo; onResolved: (id: string) => void }) {
  const [theirs, setTheirs] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ body: string }>(`/api/notes/read?path=${encodeURIComponent(c.path ?? '')}`)
      .then((n) => setTheirs(n.body.trim()))
      .catch(() => setTheirs('(could not load the vault version)'));
  }, [c.path]);

  async function choose(choice: 'mine' | 'theirs' | 'both') {
    setError('');
    try {
      await apiFetch('/api/sync/resolve', { method: 'POST', json: { path: c.path, conflictPath: c.conflictPath, choice } });
      onResolved(c.id);
    } catch {
      setError("Couldn't resolve this conflict. Please try again.");
    }
  }

  if (theirs === null) return <p className="text-sm opacity-70">Loading conflict…</p>;
  return (
    <div>
      <ConflictCard mine={c.mine} theirs={theirs} onKeepMine={() => choose('mine')} onKeepTheirs={() => choose('theirs')} onKeepBoth={() => choose('both')} />
      {error && <p role="alert" className="text-error text-sm mt-1">{error}</p>}
    </div>
  );
}

export function ConflictList({ conflicts, onResolved }: { conflicts: ConflictInfo[]; onResolved: (id: string) => void }) {
  if (conflicts.length === 0) return null;
  return <div className="space-y-2 p-2">{conflicts.map((c) => <ConflictItem key={c.id} c={c} onResolved={onResolved} />)}</div>;
}
