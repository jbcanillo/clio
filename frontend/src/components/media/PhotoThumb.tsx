import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { usePhotoUrl } from '../../lib/media';
import { Sheet } from '../ui/Sheet';

interface Props {
  /** Stored attachment file name. */
  file: string;
  /** Local preview for a photo that has not been uploaded yet. */
  previewUrl?: string;
  size?: 'sm' | 'md';
}

/** Square thumbnail; tap to see the photo full size. */
export function PhotoThumb({ file, previewUrl, size = 'md' }: Props) {
  const remote = usePhotoUrl(previewUrl ? null : file);
  const url = previewUrl ?? remote.url;
  const [open, setOpen] = useState(false);
  const box = size === 'sm' ? 'h-12 w-12' : 'h-16 w-16';
  if (!url) {
    return (
      <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-xl bg-inset text-ink-muted ${remote.failed ? '' : 'animate-pulse'}`}>
        {remote.failed ? <ImageOff aria-label="Photo unavailable" size={16} /> : null}
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} className={`${box} shrink-0 overflow-hidden rounded-xl border border-hairline`} aria-label="View photo">
        <img src={url} alt="" className="h-full w-full object-cover" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Photo">
        <img src={url} alt="" className="max-h-[70dvh] w-full rounded-xl object-contain" />
      </Sheet>
    </>
  );
}

/** A row of thumbnails, or nothing. */
export function PhotoStrip({ files, size }: { files?: string[]; size?: 'sm' | 'md' }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => <PhotoThumb key={f} file={f} size={size} />)}
    </div>
  );
}
