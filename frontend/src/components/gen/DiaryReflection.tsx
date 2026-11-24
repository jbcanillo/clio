import { Chip } from '../ui/Chip';
import type { DaySummary } from '../../lib/types';

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
}

export function DiaryReflection({ day, tone, onExpand }: Props) {
  const label = moodLabel(day.mood);
  const empty = !day.hasEntry || !day.headline.trim();
  return (
    <div className="rounded-2xl bg-card shadow-card border-l-[3px] border-l-teal p-4 space-y-2" data-tone={tone}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{day.date}</span>
        {label && <Chip tone="teal">{label}</Chip>}
      </div>
      <p className={`text-sm ${empty ? 'text-ink-soft italic' : 'text-ink'}`}>
        {empty ? 'Nothing written yet.' : day.headline}
      </p>
      {onExpand && (
        <div className="flex justify-end">
          <button type="button" className="btn btn-ghost btn-sm text-[var(--primary)]" onClick={onExpand}>Expand</button>
        </div>
      )}
    </div>
  );
}
