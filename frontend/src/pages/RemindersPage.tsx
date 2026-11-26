import { Archive } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AddReminderForm from '../components/features/AddReminderForm';
import { Sheet } from '../components/ui/Sheet';
import { ClioChat } from '../components/chat/ClioChat';
import { PageHeader } from '../components/layout/PageHeader';
import { ReminderCards } from '../components/gen/ReminderCards';
import EditReminderFormModal from '../components/features/EditReminderFormModal';
import { Chip } from '../components/ui/Chip';
import { useToast } from '../components/ui/Toast';
import { ClioActions } from '../copilot/actions';
import { useReminders } from '../hooks/useReminders';
import { apiFetch } from '../lib/api';
import { archiveReminder, completeReminder, listReminders, snoozeReminder } from '../lib/clioApi';
import { useDataVersion } from '../lib/dataEvents';
import { todayIn } from '../lib/today';
import type { Reminder } from '../lib/types';
import { reminderFromApi } from '../utils/store';

type Filter = 'all' | 'due' | 'snoozed' | 'archived';

const CHIPS = [
  { label: 'Remind me to…', prompt: 'Remind me to ' },
  { label: 'Reschedule my afternoon', prompt: 'Help me reschedule my afternoon: which of my reminders should move, and to when?' },
];

function validTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** 'YYYY-MM-DD' of an ISO instant in `tz`. */
function dayIn(iso: string | undefined, tz: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function syncedLabel(at: number | null, now: number): string {
  if (at === null) return 'Syncing…';
  const mins = Math.floor((now - at) / 60000);
  return mins < 1 ? 'Synced just now' : `Synced ${mins}m ago`;
}

export default function RemindersPage() {
  const navigate = useNavigate();
  const version = useDataVersion('reminders');
  const { createReminder, updateReminder } = useReminders();
  const location = useLocation();
  const [adding, setAdding] = useState(false);
  const { addToast } = useToast();
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [error, setError] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tz, setTz] = useState('UTC');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    apiFetch<{ timezone?: string }>('/api/settings')
      .then((s) => live && setTz(validTimezone(s.timezone)))
      .catch(() => live && setTz('UTC'));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    listReminders()
      .then((rs) => {
        if (!live) return;
        setReminders(rs);
        setError(false);
        setSyncedAt(Date.now());
        setNow(Date.now());
      })
      .catch(() => live && setError(true));
    return () => { live = false; };
  }, [version, retry]);

  // Archived reminders are fetched only when that view is open.
  const [archived, setArchived] = useState<Reminder[] | null>(null);
  useEffect(() => {
    if (filter !== 'archived') return;
    let live = true;
    listReminders({ archived: true })
      .then((rs) => { if (live) setArchived(rs); })
      .catch(() => { if (live) setArchived([]); });
    return () => { live = false; };
  }, [filter, version]);
  const toggleArchive = async (id: string, next: boolean) => { await archiveReminder(id, next); }; // emits 'reminders'

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const view = useMemo(() => {
    const all = reminders ?? [];
    const today = todayIn(tz);
    const clock = Date.now();
    const pending = all.filter((r) => !r.done);
    const dueToday = pending.filter((r) => dayIn(r.due, tz) <= today); // due today or overdue
    const snoozed = pending.filter((r) => r.snoozedUntil && new Date(r.snoozedUntil).getTime() > clock);
    const completedToday = all.filter((r) => r.done && dayIn(r.completedAt ?? r.due, tz) === today);
    const shown = filter === 'due' ? dueToday : filter === 'snoozed' ? snoozed : pending;
    return { dueToday, snoozed, completedToday, shown, pendingCount: pending.length };
  }, [reminders, tz, filter, version, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const fulfilled = view.completedToday.length;
  const total = fulfilled + view.dueToday.length;
  const pct = total === 0 ? 0 : Math.round((fulfilled / total) * 100);

  const onEditSave = useCallback(
    async (data: Record<string, unknown>) => {
      if (!editing) return;
      await updateReminder({ ...reminderFromApi(editing), ...data }); // the store emits 'reminders'
      setEditing(null);
    },
    [editing, updateReminder],
  );

  const add = () => setAdding(true);

  // Old /reminders/new links land here with ?new=1: open the form, then clear the param.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('new') !== '1') return;
    setAdding(true);
    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);

  return (
    <section aria-label="Reminders" className="px-4 py-4 md:px-6 md:py-6">
      <PageHeader
        title="Reminders"
        subtitle="What's due today and coming up. Complete, snooze or edit a reminder, or ask Clio to set one for you."
        action={
          <button
            type="button"
            aria-label="Add reminder"
            onClick={add}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ember text-xl font-bold text-white"
          >
            <span aria-hidden="true">+</span>
          </button>
        }
      >
        <span className="mt-2 inline-flex items-center rounded-full border border-hairline bg-inset px-2.5 py-0.5 text-xs font-medium text-ink-soft">
          {syncedLabel(syncedAt, now)}
        </span>
      </PageHeader>

      {error ? (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">
          <span>Couldn&apos;t load your reminders.</span>
          <button type="button" className="rounded-full border border-error/40 px-3 py-1 text-xs font-semibold" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      {reminders === null && !error ? (
        <div aria-busy="true" aria-label="Loading reminders" className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-inset" />)}
        </div>
      ) : null}

      {reminders !== null && reminders.length === 0 && filter !== 'archived' ? (
        <div className="rounded-2xl border border-hairline bg-card p-6 text-center">
          <p className="font-medium text-ink">No reminders yet</p>
          <p className="mt-1 text-sm text-ink-soft">Add one here, or just tell Clio what to remember.</p>
          <button type="button" onClick={add} className="mt-4 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white">
            Add reminder
          </button>
        </div>
      ) : null}

      {/* Today's progress sits above the reminders list (and its filters). */}
      {reminders !== null && reminders.length > 0 && filter !== 'archived' ? (
        <section className="mb-4 rounded-2xl border border-hairline bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Daily rhythm</h3>
          {total === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No reminders due today</p>
          ) : (
            <>
              <div
                role="progressbar"
                aria-label="Daily rhythm"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="mt-2 h-2 overflow-hidden rounded-full bg-inset"
              >
                <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-sm text-ink-soft">{`${fulfilled} of ${total} loops fulfilled today`}</p>
            </>
          )}
        </section>
      ) : null}

      {reminders !== null ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>{`All ${view.pendingCount}`}</Chip>
          <Chip selected={filter === 'due'} onClick={() => setFilter('due')}>{`Due today ${view.dueToday.length}`}</Chip>
          <Chip selected={filter === 'snoozed'} onClick={() => setFilter('snoozed')}>{`Snoozed ${view.snoozed.length}`}</Chip>
          <Chip selected={filter === 'archived'} onClick={() => setFilter('archived')} icon={<Archive size={12} />}>Archived</Chip>
        </div>
      ) : null}

      {filter === 'archived' ? (
        <section aria-label="Archived reminders">
          <p className="mb-3 text-xs text-ink-soft">Archived reminders are kept but hidden and never notify you. Unarchive one to bring it back.</p>
          {archived === null ? (
            <div aria-busy="true" aria-label="Loading archived reminders" className="h-16 animate-pulse rounded-2xl bg-inset" />
          ) : archived.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing archived.</p>
          ) : (
            <ReminderCards
              reminders={archived}
              timezone={tz}
              onComplete={() => undefined}
              onSnooze={() => undefined}
              onArchive={toggleArchive}
            />
          )}
        </section>
      ) : null}

      {reminders !== null && reminders.length > 0 && filter !== 'archived' ? (
        <>
          <ReminderCards
            grouped
            reminders={view.shown}
            timezone={tz}
            onComplete={async (id) => { await completeReminder(id); }}
            onSnooze={async (id, until) => { await snoozeReminder(id, until); }}
            onEdit={setEditing}
            onArchive={toggleArchive}
          />

          {view.completedToday.length > 0 ? (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Completed today ({view.completedToday.length})</h3>
              <ul className="space-y-1.5">
                {view.completedToday.map((r) => (
                  <li key={r.id} className="rounded-xl bg-inset px-3 py-2 text-sm text-ink-soft line-through">{r.title}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {editing ? (
        <EditReminderFormModal reminder={reminderFromApi(editing)} onDismiss={() => setEditing(null)} onSubmit={onEditSave} onToast={addToast} />
      ) : null}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New reminder">
        <AddReminderForm
          embedded
          onDismiss={() => setAdding(false)}
          onToast={addToast}
          onSubmit={async (data: unknown) => { await createReminder(data); }} // the store emits 'reminders'
        />
      </Sheet>

      <ClioActions scope="reminders" timezone={tz} />
      <ClioChat scope="reminders" mode="sheet" placeholder="Remind me to…" chips={CHIPS} sheetTitle="Clio" />
    </section>
  );
}
