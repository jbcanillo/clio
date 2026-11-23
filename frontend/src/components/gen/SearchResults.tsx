import type { Hit } from '../../lib/types';

export function SearchResults({ hits }: { hits: Hit[] }) {
  if (hits.length === 0) return <p className="text-sm opacity-70">No matching notes.</p>;
  return (
    <ul className="space-y-2">
      {hits.map((h) => (
        <li key={h.path} className="card bg-base-200 p-3">
          <div className="font-medium">{h.title}{h.private && <span className="badge badge-sm ml-2">private</span>}</div>
          <div className="text-xs opacity-70">{h.date ?? h.path}</div>
          <div className="text-sm mt-1">{h.snippet}</div>
        </li>
      ))}
    </ul>
  );
}
