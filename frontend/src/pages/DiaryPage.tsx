import { useEffect, useMemo, useState } from 'react';
import { ClioChat } from '../components/chat/ClioChat';
import { DayStrip, weekStartOf } from '../components/DayStrip';
import { CheckinForm, type CheckinValues } from '../components/gen/CheckinForm';
import { DiaryReflection } from '../components/gen/DiaryReflection';
import { WeeklyReflection } from '../components/gen/WeeklyReflection';
import { Sheet } from '../components/ui/Sheet';
import { ClioActions, saveCheckin } from '../copilot/actions';
import { useJournal } from '../hooks/useJournal';
import { apiFetch } from '../lib/api';
import { dailyRange } from '../lib/clioApi';
import { emitDataChanged, useDataVersion } from '../lib/dataEvents';
import { addDays, todayIn } from '../lib/today';
import type { DaySummary } from '../lib/types';

const CHIPS = [
  { label: 'Reflect on today', prompt: 'Help me reflect on my day today.' },
  { label: "How's my week been?", prompt: "How's my week been? Summarize my mood and entries." },
];

interface LegacyEntry { id: string | number; text: string; mood?: string; createdAt: string }

function validTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function dayIn(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

type Item = { kind: 'day'; date: string; day: DaySummary } | { kind: 'journal'; date: string; entry: LegacyEntry };

export default function DiaryPage() {
  const version = useDataVersion('daily');
  const { entries: journal } = useJournal() as { entries: LegacyEntry[] };
  const [tz, setTz] = useState('UTC');
  const [selected, setSelected] = useState<string | null>(null);
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinError, setCheckinError] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch<{ timezone?: string }>('/api/settings')
      .then((s) => { if (live) { const z = validTimezone(s.timezone); setTz(z); setSelected(todayIn(z)); } })
      .catch(() => { if (live) { setTz('UTC'); setSelected(todayIn('UTC')); } });
    return () => { live = false; };
  }, []);

  const weekStart = selected ? weekStartOf(selected) : null;
  const weekEnd = weekStart ? addDays(weekStart, 6) : null;

  useEffect(() => { setDays(null); }, [weekStart]);

  useEffect(() => {
    if (!weekStart || !weekEnd) return;
    let live = true; // last response wins: stale fetches are ignored after cleanup
    dailyRange(weekStart, weekEnd)
      .then((d) => { if (live) { setDays(d); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [weekStart, weekEnd, version, retry]);

  const weekDays = useMemo(
    () => (days ?? []).filter((d) => weekStart && weekEnd && d.date >= weekStart && d.date <= weekEnd),
    [days, weekStart, weekEnd],
  );

  const items = useMemo(() => {
    if (!weekStart || !weekEnd || !selected) return [] as Item[];
    const list: Item[] = weekDays.filter((d) => d.hasEntry).map((day) => ({ kind: 'day', date: day.date, day }));
    for (const entry of Array.isArray(journal) ? journal : []) {
      const date = dayIn(entry.createdAt, tz);
      if (date && date >= weekStart && date <= weekEnd) list.push({ kind: 'journal', date, entry });
    }
    const rank = (i: Item) => (i.date === selected ? 1 : 0);
    return list.sort((a, b) =>
      rank(b) - rank(a) || (a.date < b.date ? 1 : a.date > b.date ? -1 : a.kind === b.kind ? 0 : a.kind === 'day' ? -1 : 1));
  }, [weekDays, journal, tz, weekStart, weekEnd, selected]);

  const month = selected
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${selected}T00:00:00Z`))
    : '';

  const openCheckin = () => { setCheckinError(false); setCheckinOpen(true); };
  const submit = async (values: CheckinValues) => {
    if (!selected) return;
    try {
      await saveCheckin(selected, values);
    } catch {
      setCheckinError(true);
      return;
    }
    setCheckinOpen(false);
    emitDataChanged('daily');
  };

  const loading = selected === null || (days === null && !error);
  const empty = days !== null && !error && items.length === 0;
  const hasEntries = weekDays.some((d) => d.hasEntry);

  return (
    <section aria-label="Diary" className="px-4 py-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-ink">{month}</h2>
        <button type="button" onClick={openCheckin} className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white">
          Check in
        </button>
      </header>

      {selected ? (
        <DayStrip
          days={weekDays}
          selected={selected}
          onSelect={setSelected}
          onPrevWeek={() => setSelected(addDays(selected, -7))}
          onNextWeek={() => setSelected(addDays(selected, 7))}
        />
      ) : null}

      {error ? (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">
          <span>Couldn&apos;t load your diary.</span>
          <button type="button" className="rounded-full border border-error/40 px-3 py-1 text-xs font-semibold" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      {loading && !error ? (
        <div aria-busy="true" aria-label="Loading diary" className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-inset" />)}
        </div>
      ) : null}

      {hasEntries && !error ? <div className="mt-4"><WeeklyReflection days={weekDays} /></div> : null}

      {days !== null && !error ? (
        <section className="mt-6" aria-label="Timeline log">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Timeline log</h3>
          {empty ? (
            <div className="rounded-2xl border border-hairline bg-card p-6 text-center">
              <p className="text-sm text-ink-soft">No entries this week yet.</p>
              <button type="button" onClick={openCheckin} className="mt-3 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white">
                Check in
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((it) =>
                it.kind === 'day' ? (
                  <li key={`d-${it.date}`}><DiaryReflection day={it.day} /></li>
                ) : (
                  <li key={`j-${it.entry.id}`} className="rounded-2xl border-l-[3px] border-l-ink-muted bg-card p-4 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{it.date}</span>
                      {it.entry.mood ? <span>{it.entry.mood}</span> : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{it.entry.text}</p>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      ) : null}

      <Sheet open={checkinOpen} onClose={() => setCheckinOpen(false)} title="Daily check-in">
        <CheckinForm onSubmit={submit} onSkip={() => setCheckinOpen(false)} />
        {checkinError ? <p role="alert" className="mt-2 text-sm text-error">Couldn&apos;t save your check-in. Try again.</p> : null}
      </Sheet>

      <ClioActions scope="diary" timezone={tz} />
      <ClioChat scope="diary" mode="sheet" placeholder="Reflect with Clio…" chips={CHIPS} sheetTitle="Clio" />
    </section>
  );
}
