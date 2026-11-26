import { MapPin, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { Place } from '../../lib/types';

// The map (Leaflet) loads only when the picker is opened.
const LocationPicker = lazy(() => import('../features/LocationPicker'));

export const placeLabel = (p: Place) => p.label?.trim() || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
export const mapLink = (p: Place) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`;

interface Props {
  value: Place[];
  onChange: (next: Place[]) => void;
  single?: boolean;
}

export function PlacePicker({ value, onChange, single = false }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Place | null>(null);
  const [label, setLabel] = useState('');

  const confirm = () => {
    if (!pending) return;
    const place = { ...pending, ...(label.trim() ? { label: label.trim() } : {}) };
    onChange(single ? [place] : [...value, place]);
    setPending(null);
    setLabel('');
  };

  return (
    <div className="space-y-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((p, i) => (
            <li key={`${p.lat},${p.lng},${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-inset py-1 pl-3 pr-1 text-xs text-ink">
              <MapPin aria-hidden="true" size={12} className="text-ember" />
              <span className="font-semibold">{placeLabel(p)}</span>
              <button type="button" aria-label={`Remove ${placeLabel(p)}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-card">
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {pending ? (
        <div className="space-y-2 rounded-xl border border-hairline p-3">
          <p className="text-xs text-ink-soft">{`Pinned at ${pending.lat.toFixed(5)}, ${pending.lng.toFixed(5)}`}</p>
          <label className="block text-xs text-ink-soft">Name this place (optional)
            <input className="mt-1 w-full rounded-lg border border-hairline bg-inset px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Grandma's house" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPending(null)}>Cancel</button>
            <button type="button" className="btn btn-xs border-0 bg-teal text-on-teal" onClick={confirm}>Add place</button>
          </div>
        </div>
      ) : single && value.length ? null : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-inset">
          <MapPin aria-hidden="true" size={14} /> Add place
        </button>
      )}
      {open ? (
        <Suspense fallback={null}>
          <LocationPicker
            onCancel={() => setOpen(false)}
            onConfirm={(pos: { lat: number; lng: number }) => { setOpen(false); setPending({ lat: pos.lat, lng: pos.lng }); }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
