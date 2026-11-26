import { Camera, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { preparePhoto, type PhotoItem } from '../../lib/media';
import { PhotoThumb } from './PhotoThumb';

interface Props {
  value: PhotoItem[];
  onChange: (next: PhotoItem[]) => void;
  max?: number;
}

/** Pick photos from the gallery or camera (the phone offers both). Photos upload when the form is saved. */
export function PhotoPicker({ value, onChange, max = 10 }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    setBusy(true);
    const added: PhotoItem[] = [];
    for (const f of Array.from(files).slice(0, Math.max(0, max - value.length))) {
      try {
        const prepared = await preparePhoto(f);
        added.push({ file: prepared.file, prepared });
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setBusy(false);
    if (added.length) onChange([...value, ...added]);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((p) => (
          <span key={p.file} className="relative">
            <PhotoThumb file={p.file} previewUrl={p.prepared?.url} />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange(value.filter((x) => x.file !== p.file))}
              className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-error text-white shadow"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        {value.length < max ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="inline-flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-hairline text-xs text-ink-soft hover:bg-inset disabled:opacity-50"
          >
            <Camera aria-hidden="true" size={18} />
            {busy ? '…' : 'Photo'}
          </button>
        ) : null}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" aria-label="Add photos" onChange={(e) => void pick(e.target.files)} />
      {error ? <p role="alert" className="text-xs text-error">{error}</p> : null}
    </div>
  );
}
