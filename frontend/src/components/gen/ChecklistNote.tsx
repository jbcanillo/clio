import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import type { NoteSummary } from '../../lib/types';
import { Chip } from '../ui/Chip';
import { CircleCheck } from '../ui/CircleCheck';

interface Props {
  note: NoteSummary;
  onToggle: (index: number, checked: boolean) => Promise<void>;
  onOpen?: () => void;
  onConflict?: () => void;
}

type Msg = null | 'conflict' | 'error';

export function ChecklistNote({ note, onToggle, onOpen, onConflict }: Props) {
  // Props are the source of truth; overrides are optimistic and dropped when the note prop changes.
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const inFlight = useRef(new Set<number>());
  const [msg, setMsg] = useState<Msg>(null);

  // Re-sync only when the server's view of the checklist changes, not on object identity.
  const signature = JSON.stringify(note.checklist.map((c) => [c.index, c.text, c.done]));
  const prevSignature = useRef(signature);
  useEffect(() => {
    if (prevSignature.current === signature) return;
    prevSignature.current = signature;
    setOverrides((o) => {
      const kept: Record<number, boolean> = {};
      for (const k of Object.keys(o)) if (inFlight.current.has(Number(k))) kept[Number(k)] = o[Number(k)];
      return kept;
    });
  }, [signature]);

  const doneOf = (index: number, done: boolean) => (index in overrides ? overrides[index] : done);
  const total = note.checklist.length;
  const doneCount = note.checklist.filter((c) => doneOf(c.index, c.done)).length;

  const toggle = async (index: number, next: boolean) => {
    if (inFlight.current.has(index)) return;
    inFlight.current.add(index);
    setPending((p) => ({ ...p, [index]: true }));
    setMsg(null);
    setOverrides((o) => ({ ...o, [index]: next }));
    try {
      await onToggle(index, next);
    } catch (e) {
      setOverrides((o) => {
        const { [index]: _drop, ...rest } = o;
        return rest;
      });
      if (e instanceof ApiError && e.status === 409) {
        setMsg('conflict');
        onConflict?.();
      } else {
        setMsg('error');
      }
    } finally {
      inFlight.current.delete(index);
      setPending((p) => {
        const { [index]: _drop, ...rest } = p;
        return rest;
      });
    }
  };

  return (
    <div className="rounded-2xl border border-hairline bg-card p-4 space-y-2">
      <div className="font-semibold text-ink">{note.title}</div>
      {note.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {note.tags.map((t, i) => (
            <Chip key={`${t}-${i}`} tone="teal">{`#${t}`}</Chip>
          ))}
        </div>
      ) : null}
      {note.snippet ? <p className="text-sm text-ink-soft">{note.snippet}</p> : null}
      {total > 0 ? (
        <>
          <ul className="space-y-1.5">
            {note.checklist.map((c) => {
              const done = doneOf(c.index, c.done);
              return (
                <li key={c.index} className="flex items-center gap-3">
                  <CircleCheck checked={done} label={c.text} disabled={!!pending[c.index]} onChange={(next) => toggle(c.index, next)} />
                  <span className={`text-sm ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{c.text}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-muted">{`${doneCount} of ${total} done`}</p>
        </>
      ) : null}
      {msg === 'conflict' ? <p role="status" className="text-xs text-ink-soft">This note changed elsewhere — reloaded.</p> : null}
      {msg === 'error' ? <p role="alert" className="text-xs text-error">Couldn't update that note.</p> : null}
      {onOpen ? (
        <div className="flex justify-end">
          <button type="button" className="btn btn-ghost btn-sm text-[var(--primary)]" onClick={onOpen}>Open in Notes</button>
        </div>
      ) : null}
    </div>
  );
}
