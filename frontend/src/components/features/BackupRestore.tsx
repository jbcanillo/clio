import { useRef, useState, type FormEvent } from 'react';
import { DatabaseBackup, RotateCcw } from 'lucide-react';
import {
  MIN_PASSWORD, createBackup, openBackupFile, restoreBackup,
  type BackupCounts, type OpenedBackup,
} from '../../lib/backup';

const field = 'w-full rounded-lg border border-hairline bg-inset px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-teal';
const labelCls = 'block text-sm font-medium text-ink';
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong.');

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "3 reminders, 1 note, 12 diary days…", leaving out what the backup has none of. */
export function describeCounts(c: BackupCounts): string {
  const parts = [
    c.reminders && plural(c.reminders, 'reminder'),
    c.notes && plural(c.notes, 'note'),
    c.diary && plural(c.diary, 'diary day'),
    c.journal && plural(c.journal, 'journal entry', 'journal entries'),
    c.photos && plural(c.photos, 'photo'),
    c.other && plural(c.other, 'other file'),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing yet';
}

function BackupSection({ onToast }: { onToast?: (msg: string, type: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone('');
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("The passwords don't match.");
    setError('');
    setBusy(true);
    try {
      const counts = await createBackup(password);
      setPassword('');
      setConfirm('');
      setDone(`Backup downloaded: ${describeCounts(counts)}.`);
      onToast?.('Backup downloaded', 'success');
    } catch (err) {
      setError(`Backup failed: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-labelledby="backup-heading">
      <h3 id="backup-heading" className="flex items-center gap-2 font-semibold text-ink"><DatabaseBackup aria-hidden="true" size={16} /> Back up</h3>
      <p className="text-xs text-ink-soft">
        Downloads one encrypted file with all your reminders, notes, diary days, journal entries, photos and what Clio remembers about you.
        There is no way to open it without the password, so keep the password safe.
      </p>
      <label className={labelCls}>Backup password
        <input className={`${field} mt-1`} type="password" autoComplete="new-password" value={password}
               onChange={(e) => { setPassword(e.target.value); setError(''); }} />
      </label>
      <label className={labelCls}>Repeat the password
        <input className={`${field} mt-1`} type="password" autoComplete="new-password" value={confirm}
               onChange={(e) => { setConfirm(e.target.value); setError(''); }} />
      </label>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {done && <p role="status" className="text-sm text-[var(--success)]">{done}</p>}
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Preparing backup…' : 'Download backup'}</button>
      </div>
    </form>
  );
}

function RestoreSection({ onToast, onRestored }: { onToast?: (msg: string, type: string) => void; onRestored?: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [opened, setOpened] = useState<OpenedBackup | null>(null);
  const [replace, setReplace] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const reset = () => {
    setOpened(null);
    setFile(null);
    setPassword('');
    setProgress(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  async function open(e: FormEvent) {
    e.preventDefault();
    setDone('');
    if (!file) return setError('Choose a backup file.');
    if (!password) return setError('Enter the password used for this backup.');
    setError('');
    setBusy(true);
    try {
      setOpened(await openBackupFile(file, password));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!opened) return;
    setBusy(true);
    setError('');
    try {
      await restoreBackup(opened, { replace }, (d, t) => setProgress({ done: d, total: t }));
      const summary = describeCounts(opened.counts);
      reset();
      setDone(`Restored ${summary}.`);
      onToast?.('Restore complete', 'success');
      onRestored?.();
    } catch (err) {
      setError(`Restore stopped: ${errorText(err)} Items already restored were kept; you can run the restore again.`);
    } finally {
      setBusy(false);
    }
  }

  const when = opened?.exportedAt ? new Date(opened.exportedAt).toLocaleString() : null;

  return (
    <div className="space-y-3" aria-labelledby="restore-heading" role="group">
      <h3 id="restore-heading" className="flex items-center gap-2 font-semibold text-ink"><RotateCcw aria-hidden="true" size={16} /> Restore</h3>
      {!opened ? (
        <form onSubmit={open} className="space-y-3">
          <p className="text-xs text-ink-soft">Choose a Clio backup file and enter its password. You'll see what it contains before anything changes.</p>
          <div>
            <span className={labelCls}>Backup file</span>
            <input ref={fileInput} id="backup-file-input" type="file" accept=".enc,application/octet-stream" className="sr-only"
                   onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); setDone(''); }} />
            <label htmlFor="backup-file-input"
                   className="mt-1 flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-hairline bg-inset px-4 py-3 text-sm text-ink hover:border-teal">
              {file ? file.name : 'Choose file…'}
            </label>
          </div>
          <label className={labelCls}>Backup password
            <input className={`${field} mt-1`} type="password" autoComplete="off" value={password}
                   onChange={(e) => { setPassword(e.target.value); setError(''); }} />
          </label>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          {done && <p role="status" className="text-sm text-[var(--success)]">{done}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Opening…' : 'Open backup'}</button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            {when ? <>Backup from <strong>{when}</strong>: </> : 'This backup has: '}{describeCounts(opened.counts)}.
          </p>
          {opened.kind === 'legacy' && <p className="text-xs text-ink-soft">This is an older backup: it has only reminders and journal entries.</p>}
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="sr-only">How to restore</legend>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="radio" name="restore-mode" className="radio radio-sm mt-0.5" checked={replace} onChange={() => setReplace(true)} />
              <span><strong>Replace</strong>: make Clio match the backup. Items added since the backup are removed (photos are kept).</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="radio" name="restore-mode" className="radio radio-sm mt-0.5" checked={!replace} onChange={() => setReplace(false)} />
              <span><strong>Merge</strong>: add the backup's items and keep everything else. Items in both are set back to the backup's version.</span>
            </label>
          </fieldset>
          {progress && busy && <p role="status" className="text-sm text-ink-soft">Restoring… {progress.done} of {progress.total}</p>}
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { reset(); setError(''); }} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-warning btn-sm" onClick={run} disabled={busy}>
              {busy ? 'Restoring…' : replace ? 'Replace with backup' : 'Merge backup'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Backup and restore of everything Clio stores, side by side. */
export function BackupRestore({ onToast, onRestored }: { onToast?: (msg: string, type: string) => void; onRestored?: () => void }) {
  return (
    <div className="space-y-6">
      <BackupSection onToast={onToast} />
      <div className="border-t border-hairline" />
      <RestoreSection onToast={onToast} onRestored={onRestored} />
    </div>
  );
}
