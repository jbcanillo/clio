import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';

export interface PickerModel {
  id: string;
  name: string;
  free: boolean;
  context: number | null;
}

const MAX_OPTIONS = 300;

function contextLabel(n: number | null): string {
  if (!n) return '';
  return n >= 1_000_000 ? ` · ${Math.round(n / 1_000_000)}M ctx` : ` · ${Math.round(n / 1000)}K ctx`;
}

/** Choose an OpenRouter model, listing only the ones that support tool calling (Clio needs tools). */
export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [models, setModels] = useState<PickerModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);

  useEffect(() => {
    apiFetch<{ models: PickerModel[] }>('/api/settings/models')
      .then((r) => (Array.isArray(r?.models) ? setModels(r.models) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const shown = useMemo(() => {
    if (!models) return [];
    const q = query.trim().toLowerCase();
    return models
      .filter((m) => (!freeOnly || m.free) && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)))
      .slice(0, MAX_OPTIONS);
  }, [models, query, freeOnly]);

  if (failed) {
    return (
      <label className="block text-sm">
        Model
        <input className="input input-bordered w-full" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="mt-1 block text-xs text-ink-muted">Couldn't load the model list; type a model id.</span>
      </label>
    );
  }

  const current = models?.find((m) => m.id === value);
  const currentHidden = Boolean(value) && !shown.some((m) => m.id === value);

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        Model <span className="text-ink-muted">(only models that can use tools are listed)</span>
        <select
          className="select select-bordered w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!models}
        >
          {!models ? <option value={value}>Loading models…</option> : null}
          {models && currentHidden ? (
            <option value={value}>
              {current ? `${current.name}${current.free ? ' (free)' : ''}` : `${value} ⚠ can't use tools`}
            </option>
          ) : null}
          {shown.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.free ? ' (free)' : ''}
              {contextLabel(m.context)}
            </option>
          ))}
        </select>
      </label>
      {models ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            className="input input-bordered min-w-0 flex-1"
            placeholder={`Search ${models.length} models`}
            aria-label="Search models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-primary" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
            Free only
          </label>
        </div>
      ) : null}
      {models && !current && value ? (
        <p role="alert" className="text-sm text-error">
          "{value}" can't use tools, so Clio can't chat with it. Pick a model from the list.
        </p>
      ) : null}
    </div>
  );
}
