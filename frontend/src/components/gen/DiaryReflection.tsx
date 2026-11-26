import { MapPin, Pencil, User } from 'lucide-react';
import { Chip } from '../ui/Chip';
import type { DaySummary } from '../../lib/types';
import { PhotoStrip } from '../media/PhotoThumb';
import { mapLink, placeLabel } from '../media/PlacePicker';

const MOOD_LABELS = ['Low', 'Down', 'Okay', 'Good', 'Great'];

export function moodLabel(mood: number | null): string | null {
  if (mood === null || !Number.isFinite(mood)) return null;
  const i = Math.min(5, Math.max(1, Math.round(mood))) - 1;
  return MOOD_LABELS[i];
}

interface Props {
  day: DaySummary;
  tone?: string;
  onExpand?: () => void;
  /** Makes the card open the day for editing. */
  onEdit?: () => void;
}

export function DiaryReflection({ day, tone, onExpand, onEdit }: Props) {
  const label = moodLabel(day.mood);
  const hasMedia = !!(day.photos?.length || day.people?.length || day.places?.length);
  const empty = !day.hasEntry || (!day.headline.trim() && !hasMedia);
  return (
    <div className="relative rounded-2xl bg-card shadow-card border-l-[3px] border-l-teal p-4 space-y-2" data-tone={tone}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{day.date}</span>
        <span className="flex items-center gap-2">
          {label && <Chip tone="teal">{label}</Chip>}
          {onEdit ? (
            <button type="button" onClick={onEdit} aria-label={`Edit ${day.date}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-inset after:absolute after:inset-0 after:content-['']">
              <Pencil aria-hidden="true" size={14} />
            </button>
          ) : null}
        </span>
      </div>
      {day.headline.trim() || empty ? (
        <p className={`text-sm ${empty ? 'text-ink-soft italic' : 'text-ink'}`}>
          {empty ? 'Nothing written yet.' : day.headline}
        </p>
      ) : null}
      {day.photos?.length ? <div className="relative z-10"><PhotoStrip files={day.photos} size="sm" /></div> : null}
      {day.people?.length || day.places?.length ? (
        <div className="relative z-10 flex flex-wrap gap-1.5">
          {(day.people ?? []).map((n, i) => <Chip key={`p-${n}-${i}`} icon={<User size={12} />}>{n}</Chip>)}
          {(day.places ?? []).map((p, i) => (
            <a key={`l-${p.lat}-${p.lng}-${i}`} href={mapLink(p)} target="_blank" rel="noreferrer noopener">
              <Chip tone="ember" icon={<MapPin size={12} />}>{placeLabel(p)}</Chip>
            </a>
          ))}
        </div>
      ) : null}
      {onExpand && (
        <div className="flex justify-end">
          <button type="button" className="btn btn-ghost btn-sm text-[var(--primary)]" onClick={onExpand}>Expand</button>
        </div>
      )}
    </div>
  );
}
