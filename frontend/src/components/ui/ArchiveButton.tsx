import { useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';

interface Props {
  /** What is being archived, for the accessible name ("Archive Groceries"). */
  label: string;
  /** True on an archived item: the button restores it instead. */
  archived?: boolean;
  onClick: () => Promise<unknown> | void;
  className?: string;
}

/**
 * Archives or restores one item. Clio never deletes: archived items leave the normal lists
 * but stay in the vault and in backups.
 */
export function ArchiveButton({ label, archived = false, onClick, className = '' }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const verb = archived ? 'Unarchive' : 'Archive';
  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onClick();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className={`relative z-10 inline-flex items-center gap-1 ${className}`}>
      {failed ? <span role="alert" className="text-xs text-error">Couldn&apos;t {verb.toLowerCase()}.</span> : null}
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        aria-label={`${verb} ${label}`}
        title={verb}
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold text-ink-soft hover:bg-inset disabled:opacity-50"
      >
        {archived ? <ArchiveRestore aria-hidden="true" size={14} /> : <Archive aria-hidden="true" size={14} />}
        {archived ? <span>Unarchive</span> : null}
      </button>
    </span>
  );
}
