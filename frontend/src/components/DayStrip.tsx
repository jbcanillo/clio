import { moodLabel } from './gen/DiaryReflection';
import { addDays } from '../lib/today';
import type { DaySummary } from '../lib/types';

interface Props {
  days: DaySummary[];
  selected: string;
  onSelect: (date: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday of the week containing the 'YYYY-MM-DD' key. */
export function weekStartOf(key: string): string {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

function dotTone(d: DaySummary | undefined): 'teal' | 'slate' | 'ember' | null {
  if (!d || !d.hasEntry || d.mood === null) return null;
  return d.mood >= 4 ? 'teal' : d.mood >= 3 ? 'slate' : 'ember';
}
const DOT_CLASS = { teal: 'bg-teal', slate: 'bg-ink-muted', ember: 'bg-ember' } as const;

export function DayStrip({ days, selected, onSelect, onPrevWeek, onNextWeek }: Props) {
  const start = weekStartOf(selected);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const btn = 'flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-inset';
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Previous week" onClick={onPrevWeek} className={btn}><span aria-hidden="true">‹</span></button>
      <div className="flex flex-1 justify-between">
        {LETTERS.map((letter, i) => {
          const date = addDays(start, i);
          const d = byDate.get(date);
          const tone = dotTone(d);
          const num = Number(date.slice(8));
          const isSel = date === selected;
          const label = `${NAMES[i]} ${num}, ${tone ? `mood ${moodLabel(d!.mood)}` : 'no entry'}`;
          return (
            <button
              key={date}
              type="button"
              aria-label={label}
              aria-pressed={isSel}
              onClick={() => onSelect(date)}
              className={`flex w-10 flex-col items-center gap-0.5 rounded-full py-2 text-xs ${isSel ? 'bg-teal text-on-teal' : 'text-ink-soft hover:bg-inset'}`}
            >
              <span aria-hidden="true" className="font-semibold">{letter}</span>
              <span aria-hidden="true" className="text-sm font-bold">{num}</span>
              <span className="h-1.5 w-1.5">
                {tone ? <span data-dot={tone} className={`block h-1.5 w-1.5 rounded-full ${isSel && tone !== 'ember' ? 'bg-white' : DOT_CLASS[tone]}`} /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="Next week" onClick={onNextWeek} className={btn}><span aria-hidden="true">›</span></button>
    </div>
  );
}
