import type { DaySummary } from '../../lib/types';

const FOCI = [
  ['thoughts', 'Thoughts'],
  ['ideas', 'Ideas'],
  ['events', 'Events'],
] as const;

export function weeklyStats(days: DaySummary[]) {
  const entries = days.filter((d) => d.hasEntry).length;
  const moods = days.map((d) => d.mood).filter((m): m is number => typeof m === 'number');
  const avgMood = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : null;
  const totals = FOCI.map(([k, name]) => ({
    name,
    n: days.reduce((s, d) => s + (d.sections?.[k] ?? 0), 0),
  }));
  const max = Math.max(...totals.map((t) => t.n));
  const top = totals.filter((t) => t.n === max);
  const dominantFocus = max > 0 && top.length === 1 ? top[0].name : null;
  return { entries, avgMood, dominantFocus };
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-white/80">{label}</div>
      <div className="text-base font-bold text-white">{value}</div>
    </div>
  );
}

export function WeeklyReflection({ days }: { days: DaySummary[] }) {
  const { entries, avgMood, dominantFocus } = weeklyStats(days);
  const noun = entries === 1 ? 'entry' : 'entries';
  const summary =
    entries === 0
      ? 'No entries this week yet.'
      : `You wrote ${entries} ${noun} this week${avgMood ? `, with an average mood of ${avgMood}` : ''}.`;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-teal to-[#0D4C55] p-4 text-white shadow-card space-y-3">
      <div className="text-sm font-semibold text-white">Weekly Reflection</div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Reflections" value={`${entries} ${entries === 1 ? 'Entry' : 'Entries'}`} />
        <Tile label="Avg Mood" value={avgMood ?? '–'} />
        <Tile label="Dominant Focus" value={dominantFocus ?? '–'} />
      </div>
      <p className="text-sm text-white/90">{summary}</p>
    </div>
  );
}
