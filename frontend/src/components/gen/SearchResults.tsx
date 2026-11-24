import type { Hit } from '../../lib/types';
import { Chip } from '../ui/Chip';

export function SearchResults({ hits }: { hits: Hit[] }) {
  if (hits.length === 0) return <p className="text-sm text-ink-soft">No matching notes.</p>;
  return (
    <ul className="space-y-2">
      {hits.map((h) => (
        <li key={h.path} className="rounded-2xl border border-hairline bg-card p-3">
          <div className="flex items-center gap-2 font-medium text-ink">
            <span>{h.title}</span>
            {h.private && <Chip>private</Chip>}
          </div>
          <div className="text-xs text-ink-muted">{h.date ?? h.path}</div>
          <div className="mt-1 text-sm text-ink-soft">{h.snippet}</div>
        </li>
      ))}
    </ul>
  );
}
