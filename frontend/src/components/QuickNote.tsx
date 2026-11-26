import { FormEvent, useState } from 'react';
import { photoMarkdown, savePhotoItems, type PhotoItem } from '../lib/media';
import { PhotoPicker } from './media/PhotoPicker';

interface Props {
  onSave: (note: { title: string; body: string }) => Promise<void>;
  /** Editing an existing note: the form starts from it. */
  initial?: { title: string; text: string; photos: string[] };
  submitLabel?: string;
  onCancel?: () => void;
}

/** Joins the note text and its photo links into the markdown body that is stored. */
export function noteBody(text: string, photos: string[]): string {
  const links = photos.map(photoMarkdown).join('\n');
  return [text.trimEnd(), links].filter(Boolean).join('\n\n');
}

/** Capture or edit a note, with photos. Works offline: the parent queues it in the encrypted outbox. */
export function QuickNote({ onSave, initial, submitLabel = 'Save note', onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.text ?? '');
  const [photos, setPhotos] = useState<PhotoItem[]>((initial?.photos ?? []).map((file) => ({ file })));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    try {
      const files = await savePhotoItems(photos);
      await onSave({ title: title.trim(), body: noteBody(body, files) });
      if (!initial) {
        setTitle('');
        setBody('');
        setPhotos([]);
      }
      setStatus('saved');
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  const empty = title.trim() === '' || (body.trim() === '' && photos.length === 0);
  return (
    <form onSubmit={submit} className="card bg-base-200 p-3 space-y-2">
      <label className="block text-sm">Title
        <input className="input input-bordered input-sm w-full mt-1" value={title} onChange={(e) => { setTitle(e.target.value); setStatus('idle'); }} />
      </label>
      <label className="block text-sm">Note
        <textarea className="textarea textarea-bordered w-full mt-1" rows={initial ? 6 : 3} value={body} onChange={(e) => { setBody(e.target.value); setStatus('idle'); }} />
      </label>
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">Photos</span>
        <PhotoPicker value={photos} onChange={(p) => { setPhotos(p); setStatus('idle'); }} />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button> : null}
        <button className="btn btn-primary btn-sm" disabled={empty || status === 'saving'}>{status === 'saving' ? 'Saving…' : submitLabel}</button>
      </div>
      {status === 'saved' && !initial && <p role="status" className="text-sm">Saved. It will sync when you are online.</p>}
      {status === 'error' && (
        <p role="alert" className="text-error text-sm">{initial && error ? error : "Couldn't save. Sign in again to enable offline notes."}</p>
      )}
    </form>
  );
}
