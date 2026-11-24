import { useState } from 'react';

interface Props {
  message: string;
  acceptLabel?: string;
  onAccept: () => Promise<void> | void;
  onKeep: () => void;
}

export function RescheduleSuggestion({ message, acceptLabel = 'Accept', onAccept, onKeep }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const accept = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onAccept();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ai-card rounded-2xl p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-ember">AI Context Engine</div>
      <p className="text-sm text-ink">{message}</p>
      {failed ? <p role="alert" className="text-sm text-error">Couldn't apply that change.</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={accept} className="rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
          {acceptLabel}
        </button>
        <button type="button" onClick={onKeep} className="rounded-full px-4 py-1.5 text-sm font-semibold text-ink-soft hover:bg-inset">
          Keep original
        </button>
      </div>
    </div>
  );
}
