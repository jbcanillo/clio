import { useState } from 'react';

interface Action {
  label: string;
  onRun: () => void | Promise<void>;
}

interface Props {
  title?: string;
  actions: Action[];
}

export function AiActionBox({ title, actions }: Props) {
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState(false);

  if (actions.length === 0) return null;

  const setBusy = (i: number, busy: boolean) =>
    setRunning((prev) => {
      const next = new Set(prev);
      if (busy) next.add(i); else next.delete(i);
      return next;
    });

  const run = async (i: number) => {
    if (running.has(i)) return;
    setFailed(false);
    setBusy(i, true);
    try {
      await actions[i].onRun();
    } catch {
      setFailed(true);
    } finally {
      setBusy(i, false);
    }
  };

  return (
    <div className="rounded-xl border border-[rgba(255,107,53,0.20)] bg-ember-tint p-3 space-y-2 shadow-[0_12px_32px_-6px_rgba(255,107,53,0.12)] dark:bg-[rgba(255,107,53,0.10)]">
      {title && <div className="text-xs font-semibold uppercase tracking-wide text-ember">{title}</div>}
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            disabled={running.has(i)}
            aria-busy={running.has(i)}
            onClick={() => run(i)}
            className="min-h-10 rounded-full border border-ember bg-ember/10 px-4 text-sm font-medium text-ember hover:bg-ember/20 disabled:opacity-60"
          >
            {a.label}
          </button>
        ))}
      </div>
      {failed && <div role="alert" className="text-sm text-ink-soft">Couldn't do that.</div>}
    </div>
  );
}
