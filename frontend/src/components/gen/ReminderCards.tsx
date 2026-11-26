import { Camera, MapPin, User } from 'lucide-react';
import { useState } from 'react';
import { tomorrowNineAm } from '../../lib/today';
import type { Person, Place, Reminder } from '../../lib/types';
import { mapLink, placeLabel } from '../media/PlacePicker';
import { Chip } from '../ui/Chip';
import { CircleCheck } from '../ui/CircleCheck';

interface Props {
  reminders: Reminder[];
  onComplete: (id: string) => Promise<void> | void;
  onSnooze: (id: string, until: string) => Promise<void> | void;
  onEdit?: (r: Reminder) => void;
  grouped?: boolean;
  /** The owner's IANA timezone; due times and "Tomorrow 9:00" use it. Falls back to the browser's. */
  timezone?: string;
}

const fmt = (iso: string, timeZone?: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone });

const isOverdue = (r: Reminder, now: number) =>
  !r.done && new Date(r.due).getTime() < now && !(r.snoozedUntil && new Date(r.snoozedUntil).getTime() > now);

function tomorrowNine(timezone?: string): string {
  if (timezone) return new Date(tomorrowNineAm(timezone)).toISOString();
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** What a reminder carries in its extras (older reminders may hold values of other shapes). */
function attachmentsOf(r: Reminder) {
  const x = (r.extras ?? {}) as { photos?: unknown; contact?: unknown; location?: unknown };
  const photos = Array.isArray(x.photos) ? x.photos.filter((f): f is string => typeof f === 'string') : [];
  const c = x.contact as Person | null | undefined;
  const l = x.location as Place | null | undefined;
  return {
    photos,
    contact: c && typeof c.name === 'string' && c.name ? c : null,
    location: l && typeof l.lat === 'number' && typeof l.lng === 'number' ? l : null,
  };
}

function Card({ r, onComplete, onSnooze, onEdit, timezone }: Omit<Props, 'reminders' | 'grouped'> & { r: Reminder }) {
  const [checked, setChecked] = useState(r.done);
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const overdue = isOverdue({ ...r, done: checked }, Date.now());
  const att = attachmentsOf(r);

  const complete = async (next: boolean) => {
    if (!next) return;
    setChecked(true);
    setFailed(false);
    try {
      await onComplete(r.id);
    } catch {
      setChecked(false);
      setFailed(true);
    }
  };
  const snooze = async (until: string) => {
    setMenu(false);
    setFailed(false);
    try {
      await onSnooze(r.id, until);
    } catch {
      setFailed(true);
    }
  };

  return (
    <li
      data-overdue={overdue ? 'true' : 'false'}
      className={`rounded-2xl border border-hairline bg-card p-3 ${overdue ? 'ring-2 ring-ember' : ''}`}
    >
      <div className="flex items-center gap-3">
        <CircleCheck checked={checked} onChange={complete} label={`Complete ${r.title}`} />
        <div className="min-w-0 flex-1">
          <div className={`truncate font-medium text-ink ${checked ? 'line-through opacity-60' : ''}`}>
            {onEdit ? (
              <button type="button" className="truncate text-left" onClick={() => onEdit(r)}>{r.title}</button>
            ) : (
              r.title
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tone={overdue ? 'ember' : 'neutral'}>{fmt(r.due, timezone)}</Chip>
            {r.priority === 'high' ? <Chip tone="ember">high</Chip> : <Chip>{r.priority}</Chip>}
            {r.repeat !== 'never' ? <Chip tone="teal">{r.repeat}</Chip> : null}
            {att.contact ? <Chip icon={<User size={12} />}>{[att.contact.name, att.contact.phone, att.contact.email].filter(Boolean).join(' · ')}</Chip> : null}
            {att.location ? (
              <a href={mapLink(att.location)} target="_blank" rel="noreferrer noopener"><Chip tone="ember" icon={<MapPin size={12} />}>{placeLabel(att.location)}</Chip></a>
            ) : null}
            {att.photos.length ? <Chip icon={<Camera size={12} />}>{String(att.photos.length)}</Chip> : null}
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            className="rounded-full border border-hairline px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-inset"
            aria-label={`Snooze ${r.title}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            Snooze
          </button>
          {menu ? (
            <div role="menu" className="absolute right-0 z-10 mt-1 w-36 rounded-xl border border-hairline bg-card p-1 shadow-lg">
              <button role="menuitem" type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-ink hover:bg-inset" onClick={() => snooze(new Date(Date.now() + 3600_000).toISOString())}>
                +1h
              </button>
              <button role="menuitem" type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-ink hover:bg-inset" onClick={() => snooze(tomorrowNine(timezone))}>
                Tomorrow 9:00
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {failed ? <p role="alert" className="mt-2 text-xs text-error">Couldn't update that reminder.</p> : null}
    </li>
  );
}

export function ReminderCards({ reminders, onComplete, onSnooze, onEdit, grouped, timezone }: Props) {
  if (reminders.length === 0) return <p className="text-sm text-ink-soft">Nothing coming up.</p>;
  // Keyed by server-driven fields so a refetch (e.g. a repeating reminder advancing, same id) re-syncs card state.
  const card = (r: Reminder) => <Card key={`${r.id}:${r.due}:${r.done}:${r.snoozedUntil ?? ''}`} r={r} onComplete={onComplete} onSnooze={onSnooze} onEdit={onEdit} timezone={timezone} />;
  if (!grouped) return <ul className="space-y-2">{reminders.map(card)}</ul>;
  const high = reminders.filter((r) => r.priority === 'high');
  const rest = reminders.filter((r) => r.priority !== 'high');
  return (
    <div className="space-y-4">
      {high.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ember">High priority ({high.length})</h3>
          <ul className="space-y-2">{high.map(card)}</ul>
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Upcoming</h3>
          <ul className="space-y-2">{rest.map(card)}</ul>
        </section>
      ) : null}
    </div>
  );
}
