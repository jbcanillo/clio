import type { Reminder } from '../../lib/types';

interface Props {
  reminders: Reminder[];
  onComplete: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ReminderCards({ reminders, onComplete, onSnooze }: Props) {
  if (reminders.length === 0) return <p className="text-sm opacity-70">Nothing coming up.</p>;
  return (
    <ul className="space-y-2">
      {reminders.map((r) => (
        <li key={r.id} className="card bg-base-200 p-3 flex flex-row items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{r.title}</div>
            <div className="text-xs opacity-70">
              {fmt(r.due)} · {r.priority}{r.repeat !== 'never' ? ` · ${r.repeat}` : ''}
            </div>
          </div>
          <button className="btn btn-xs btn-success" aria-label={`Complete ${r.title}`} onClick={() => onComplete(r.id)}>Done</button>
          <button
            className="btn btn-xs"
            aria-label={`Snooze ${r.title}`}
            onClick={() => onSnooze(r.id, new Date(Date.now() + 3600_000).toISOString())}
          >
            +1h
          </button>
        </li>
      ))}
    </ul>
  );
}
