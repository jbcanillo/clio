import { FormEvent, useState } from 'react';

interface Props {
  onSave: (note: { title: string; body: string }) => Promise<void>;
}

/** Capture a note. Works offline: the parent queues it in the encrypted outbox. */
export function QuickNote({ onSave }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await onSave({ title: title.trim(), body });
      setTitle('');
      setBody('');
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={submit} className="card bg-base-200 p-3 space-y-2">
      <label className="block text-sm">Title
        <input className="input input-bordered input-sm w-full mt-1" value={title} onChange={(e) => { setTitle(e.target.value); setStatus('idle'); }} />
      </label>
      <label className="block text-sm">Note
        <textarea className="textarea textarea-bordered w-full mt-1" rows={3} value={body} onChange={(e) => { setBody(e.target.value); setStatus('idle'); }} />
      </label>
      <button className="btn btn-primary btn-sm" disabled={title.trim() === '' || body.trim() === ''}>Save note</button>
      {status === 'saved' && <p role="status" className="text-sm">Saved. It will sync when you are online.</p>}
      {status === 'error' && <p role="alert" className="text-error text-sm">Couldn't save. Sign in again to enable offline notes.</p>}
    </form>
  );
}
