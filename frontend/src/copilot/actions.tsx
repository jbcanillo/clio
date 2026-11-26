import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AiActionBox } from '../components/gen/AiActionBox';
import { CheckinForm, type CheckinValues } from '../components/gen/CheckinForm';
import { ChecklistNote } from '../components/gen/ChecklistNote';
import { ConfirmCard } from '../components/gen/ConfirmCard';
import { DiaryReflection } from '../components/gen/DiaryReflection';
import { MoodChart } from '../components/gen/MoodChart';
import { NotePreview } from '../components/gen/NotePreview';
import { ReminderCards } from '../components/gen/ReminderCards';
import { RescheduleSuggestion } from '../components/gen/RescheduleSuggestion';
import { SearchResults } from '../components/gen/SearchResults';
import { WeeklyReflection } from '../components/gen/WeeklyReflection';
import { apiFetch } from '../lib/api';
import { emitDataChanged } from '../lib/dataEvents';
import { saveCheckin } from '../lib/journal';
import {
  completeReminder, createReminder, dailyRange, deleteReminder, listNotes, listReminders, snoozeReminder, toggleChecklist, updateReminder,
} from '../lib/clioApi';
import { addDays, nextNineAm, todayIn } from '../lib/today';
import type { DaySummary, Hit, MoodPoint, NoteSummary, Reminder, Scope } from '../lib/types';

const quiet = (text: string) => <p className="text-sm opacity-70">{text}</p>;

/*
 * What the model is told after a "show ..." action is a fixed sentence. The cards below load their own
 * data for the owner, so note text never travels back to the model through a tool result.
 */
function LiveReminders({ timezone }: { timezone?: string }) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  useEffect(() => { listReminders({ done: false }).then(setReminders).catch(() => setReminders([])); }, []);
  if (!reminders) return quiet('Looking up reminders…');
  return (
    <ReminderCards
      reminders={reminders}
      timezone={timezone}
      onComplete={async (id) => { await completeReminder(id); }}
      onSnooze={async (id, until) => { await snoozeReminder(id, until); }}
    />
  );
}

function LiveMood({ days, timezone }: { days?: number; timezone: string }) {
  const [series, setSeries] = useState<MoodPoint[] | null>(null);
  useEffect(() => {
    const n = Math.min(Math.max(Math.round(days ?? 14), 2), 90);
    const to = todayIn(timezone);
    apiFetch<MoodPoint[]>(`/api/analytics/mood?from=${addDays(to, -(n - 1))}&to=${to}`).then(setSeries).catch(() => setSeries([]));
  }, [days, timezone]);
  return series ? <MoodChart series={series} /> : quiet('Loading mood…');
}

function LiveSearch({ query, includePrivate }: { query: string; includePrivate: boolean }) {
  const [hits, setHits] = useState<Hit[] | null>(null);
  useEffect(() => {
    apiFetch<Hit[]>(`/api/search?q=${encodeURIComponent(query)}${includePrivate ? '&includePrivate=true' : ''}`).then(setHits).catch(() => setHits([]));
  }, [query, includePrivate]);
  return hits ? <SearchResults hits={hits} /> : quiet('Searching…');
}

/** The approval card shows the reminder as stored on the server, never a title supplied by the model. */
function DeleteReminderConfirm({ id, respond }: { id: string; respond?: (answer: string) => void }) {
  const [state, setState] = useState<{ title: string } | 'missing' | null>(null);
  useEffect(() => {
    listReminders().then((all) => {
      const found = all.find((r) => r.id === id);
      setState(found ? { title: found.title } : 'missing');
    }).catch(() => setState('missing'));
  }, [id]);
  if (state === null) return quiet('Checking the reminder…');
  if (state === 'missing') {
    return (
      <div className="card bg-base-200 p-4 space-y-2">
        <p className="text-sm">Could not find that reminder, so nothing will be deleted.</p>
        <button className="btn btn-ghost btn-sm" onClick={() => respond?.('cancelled')}>Dismiss</button>
      </div>
    );
  }
  return (
    <ConfirmCard
      title="Delete this reminder?"
      detail={state.title}
      onCancel={() => respond?.('cancelled')}
      onApprove={async () => {
        try {
          await deleteReminder(id);
          respond?.('deleted');
        } catch (e) {
          respond?.(`Delete failed: ${(e as Error).message}`);
        }
      }}
    />
  );
}

const isDateKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

function LiveDiary({ date, timezone }: { date?: string; timezone: string }) {
  const [day, setDay] = useState<DaySummary | null | 'none'>(null);
  useEffect(() => {
    const d = isDateKey(date) ? date : todayIn(timezone);
    dailyRange(d, d).then((days) => setDay(days[0] ?? 'none')).catch(() => setDay('none'));
  }, [date, timezone]);
  if (day === null) return quiet('Loading the journal…');
  if (day === 'none') return quiet('No journal entry for that day.');
  return <DiaryReflection day={day} />;
}

function LiveReflection({ days, timezone }: { days?: number; timezone: string }) {
  const [list, setList] = useState<DaySummary[] | null>(null);
  useEffect(() => {
    const n = typeof days === 'number' && Number.isFinite(days) ? Math.min(Math.max(Math.round(days), 2), 31) : 7;
    const to = todayIn(timezone);
    dailyRange(addDays(to, -(n - 1)), to).then(setList).catch(() => setList([]));
  }, [days, timezone]);
  return list ? <WeeklyReflection days={list} /> : quiet('Loading the reflection…');
}

function LiveNotes({ query }: { query: string }) {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const load = () => listNotes().then(setNotes).catch(() => setNotes([]));
  useEffect(() => { void load(); }, []);
  if (!notes) return quiet('Looking up notes…');
  const q = query.trim().toLowerCase();
  const matches = notes
    .filter((n) => n.title.toLowerCase().includes(q) || n.snippet.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
    .slice(0, 5);
  if (matches.length === 0) return quiet('No matching notes.');
  return (
    <div className="space-y-3">
      {matches.map((n) => (
        <ChecklistNote
          key={n.path}
          note={n}
          onToggle={async (index, checked) => {
            const { hash } = await toggleChecklist(n.path, index, checked, n.hash);
            setNotes((prev) => prev && prev.map((p) => (p.path === n.path ? { ...p, hash } : p)));
          }}
          onConflict={() => { void load(); }}
        />
      ))}
    </div>
  );
}

const isIsoDateTime = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));

/** Shows the reminder as stored on the server (never a model-supplied title) with the model's reason as the pitch. */
function RescheduleProposal({ id, newDue, reason, respond }: { id: string; newDue: string; reason: string; respond?: (answer: string) => void }) {
  const valid = isIsoDateTime(newDue);
  const [state, setState] = useState<{ title: string } | 'missing' | null>(null);
  const answered = useRef(false);
  const answer = (value: string) => {
    if (answered.current) return;
    answered.current = true;
    respond?.(value);
  };
  useEffect(() => {
    if (!valid) { answer('invalid'); return; }
    let live = true;
    listReminders().then((all) => {
      const found = all.find((r) => r.id === id);
      if (!live) return;
      if (found) setState({ title: found.title });
      else { setState('missing'); answer('not_found'); }
    }).catch(() => { if (live) { setState('missing'); answer('not_found'); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, newDue]);
  if (!valid) return quiet("I can't propose that time.");
  if (state === null) return quiet('Checking the reminder…');
  if (state === 'missing') return quiet("I couldn't find that reminder.");
  return (
    <RescheduleSuggestion
      message={`Move "${state.title}" to ${new Date(newDue).toLocaleString()}? ${reason}`}
      onAccept={async () => {
        try {
          await updateReminder(id, { due: newDue });
        } catch (e) {
          answer(`Reschedule failed: ${(e as Error).message}`);
          throw e; // the card shows its inline alert
        }
        answer('accepted');
      }}
      onKeep={() => answer('kept')}
    />
  );
}

/** Lists what will be created (model-proposed text) so the owner approves with full knowledge. */
function TaskProposal({ title, tasks, timezone, respond }: { title: string; tasks: string[]; timezone: string; respond?: (answer: string) => void }) {
  const [error, setError] = useState(false);
  const [finished, setFinished] = useState(false);
  const answered = useRef(false);
  const answer = (value: string) => {
    if (answered.current) return;
    answered.current = true;
    respond?.(value);
  };
  useEffect(() => { if (tasks.length === 0) answer('nothing to create'); }, [tasks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (tasks.length === 0) return quiet('No tasks to create.');
  return (
    <div className="space-y-2">
      <ul className="list-disc pl-5 text-sm">{tasks.map((t, i) => <li key={i}>{t}</li>)}</ul>
      {finished ? null : <AiActionBox
        title={title}
        actions={[
          {
            label: `Create ${tasks.length} reminders`,
            onRun: async () => {
              setError(false);
              let created = 0;
              try {
                const due = nextNineAm(timezone);
                for (const t of tasks) { await createReminder({ title: t, due }); created += 1; }
                answer(`created ${tasks.length}`);
              } catch (e) {
                // The model has been answered, so the card is finished: no retry, no duplicates.
                setError(true);
                setFinished(true);
                const msg = (e as Error).message;
                answer(created > 0 ? `created ${created} of ${tasks.length}; failed: ${msg}` : `Creating failed: ${msg}`);
              }
            },
          },
          { label: 'Not now', onRun: () => answer('declined') },
        ]}
      />}
      {error ? <p role="alert" className="text-sm text-error">Couldn't create the reminders.</p> : null}
    </div>
  );
}

/** Saves a check-in: one request for the mood and one per non-empty text field. */
/** Emits 'daily' afterwards, even on a partial failure (the mood may already be saved). */
export { saveCheckin };

type ActionProps = { timezone: string; shareOn: boolean };

function ShowReminders({ timezone }: ActionProps) {
  useCopilotAction({
    name: 'show_reminders',
    description: "Show the owner's upcoming (not done) reminders as cards.",
    parameters: [],
    handler: async () => 'Showing the reminders to the owner.',
    render: ({ status }) => (status === 'complete' ? <LiveReminders timezone={timezone} /> : quiet('Looking up reminders…')),
  });
  return null;
}

function ShowMoodChart({ timezone }: ActionProps) {
  useCopilotAction({
    name: 'show_mood_chart',
    description: "Show a chart of the owner's mood for the last N days (default 14).",
    parameters: [{ name: 'days', type: 'number', description: 'How many days back', required: false }],
    handler: async () => 'Showing the mood chart to the owner.',
    render: ({ status, args }) =>
      status === 'complete' ? <LiveMood days={typeof args.days === 'number' ? args.days : undefined} timezone={timezone} /> : quiet('Loading mood…'),
  });
  return null;
}

function ShowSearchResults({ shareOn }: ActionProps) {
  useCopilotAction({
    name: 'show_search_results',
    description: "Search the owner's notes and show matching notes as cards.",
    parameters: [{ name: 'query', type: 'string', description: 'Words to look for', required: true }],
    handler: async () => 'Showing the search results to the owner.',
    render: ({ status, args }) =>
      status === 'complete' && typeof args.query === 'string' && args.query.trim()
        ? <LiveSearch query={args.query} includePrivate={shareOn} />
        : quiet('Searching…'),
  });
  return null;
}

function CheckinAction({ timezone }: ActionProps) {
  useCopilotAction({
    name: 'checkin',
    description: 'Ask the owner for their daily check-in: mood, what happened, thoughts and ideas. Use this when they want to journal.',
    parameters: [],
    renderAndWaitForResponse: ({ status, respond }) => {
      if (status === 'complete') return <p className="text-sm opacity-70">Check-in handled.</p>;
      return (
        <CheckinForm
          onSkip={() => respond?.('The owner skipped the check-in.')}
          onSubmit={async (v) => {
            try {
              await saveCheckin(todayIn(timezone), v);
              respond?.(`Check-in saved (mood ${v.mood}).`);
            } catch (e) {
              respond?.(`Saving failed: ${(e as Error).message}`);
            }
          }}
        />
      );
    },
  });
  return null;
}

function PreviewNote() {
  useCopilotAction({
    name: 'preview_note',
    description: 'Show a draft note for the owner to approve before it is saved. After "save", call create_note with the same title and body.',
    parameters: [
      { name: 'title', type: 'string', description: 'Note title', required: true },
      { name: 'body', type: 'string', description: 'Markdown body', required: true },
    ],
    renderAndWaitForResponse: ({ status, args, respond }) => {
      if (status === 'complete') return <p className="text-sm opacity-70">Draft handled.</p>;
      return (
        <NotePreview
          title={String(args.title ?? '')}
          body={String(args.body ?? '')}
          onSave={() => respond?.('save')}
          onEdit={() => respond?.('The owner wants to edit it; ask what to change.')}
          onDiscard={() => respond?.('discard')}
        />
      );
    },
  });
  return null;
}

function DeleteReminder() {
  useCopilotAction({
    name: 'delete_reminder',
    description: 'Delete a reminder after the owner approves.',
    parameters: [{ name: 'id', type: 'string', description: 'Reminder id', required: true }],
    renderAndWaitForResponse: ({ status, args, respond }) => {
      if (status === 'complete') return <p className="text-sm opacity-70">Done.</p>;
      return <DeleteReminderConfirm id={String(args.id ?? '')} respond={respond} />;
    },
  });
  return null;
}

function ShowDiary({ timezone }: ActionProps) {
  useCopilotAction({
    name: 'show_diary',
    description: "Show the owner's diary entry for a day (default today) as a card.",
    parameters: [{ name: 'date', type: 'string', description: 'YYYY-MM-DD; omit for today', required: false }],
    handler: async () => 'Showing the diary entry to the owner.',
    render: ({ status, args }) =>
      status === 'complete' ? <LiveDiary date={typeof args.date === 'string' ? args.date : undefined} timezone={timezone} /> : quiet('Loading the journal…'),
  });
  return null;
}

function ShowReflection({ timezone }: ActionProps) {
  useCopilotAction({
    name: 'show_reflection',
    description: "Show a reflection card summarising the owner's diary for the last N days (default 7).",
    parameters: [{ name: 'days', type: 'number', description: 'How many days back (2-31)', required: false }],
    handler: async () => 'Showing the weekly reflection to the owner.',
    render: ({ status, args }) =>
      status === 'complete' ? <LiveReflection days={typeof args.days === 'number' ? args.days : undefined} timezone={timezone} /> : quiet('Loading the reflection…'),
  });
  return null;
}

function ShowNote() {
  useCopilotAction({
    name: 'show_note',
    description: "Show the owner's notes matching a title, tag or phrase as cards with checklists.",
    parameters: [{ name: 'query', type: 'string', description: 'Title, tag or words to match', required: true }],
    handler: async () => 'Showing the matching notes to the owner.',
    render: ({ status, args }) =>
      status === 'complete' && typeof args.query === 'string' ? <LiveNotes query={args.query} /> : quiet('Looking up notes…'),
  });
  return null;
}

function ProposeReschedule() {
  useCopilotAction({
    name: 'propose_reschedule',
    description: 'Suggest moving a reminder to a new time and let the owner accept or keep the original. newDue must be an ISO date-time with offset.',
    parameters: [
      { name: 'id', type: 'string', description: 'Reminder id', required: true },
      { name: 'newDue', type: 'string', description: 'Proposed ISO date-time, e.g. 2026-12-01T09:00:00+08:00', required: true },
      { name: 'reason', type: 'string', description: 'Short reason for the suggestion', required: true },
    ],
    renderAndWaitForResponse: ({ status, args, respond }) => {
      if (status === 'complete') return quiet('Handled.');
      if (status !== 'executing' || !respond) return quiet('Thinking about a better time…');
      return <RescheduleProposal id={String(args.id ?? '')} newDue={String(args.newDue ?? '')} reason={String(args.reason ?? '').slice(0, 300)} respond={respond} />;
    },
  });
  return null;
}

function ProposeTasks({ timezone }: ActionProps) {
  useCopilotAction({
    name: 'propose_tasks',
    description: 'Offer to turn a list of tasks into reminders (due next 9:00) after the owner approves.',
    parameters: [
      { name: 'title', type: 'string', description: 'Short heading for the list', required: true },
      { name: 'tasks', type: 'string[]', description: 'Task titles, at most 10', required: true },
    ],
    renderAndWaitForResponse: ({ status, args, respond }) => {
      if (status === 'complete') return quiet('Handled.');
      if (status !== 'executing' || !respond) return quiet('Drafting tasks…');
      const tasks = (Array.isArray(args.tasks) ? args.tasks : [])
        .filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 200)).filter(Boolean).slice(0, 10);
      return <TaskProposal title={String(args.title ?? '')} tasks={tasks} timezone={timezone} respond={respond} />;
    },
  });
  return null;
}

/*
 * One tiny component per action. Tools are registered per CopilotKit provider and `available` cannot be toggled
 * between renders, so each scope decides at mount which of these to render. To add an action: write one component
 * above, add it here, and list its name in ACTIONS_BY_SCOPE.
 */
const ACTION_COMPONENTS: Record<string, (p: ActionProps) => JSX.Element | null> = {
  show_reminders: ShowReminders,
  delete_reminder: DeleteReminder,
  show_mood_chart: ShowMoodChart,
  checkin: CheckinAction,
  show_search_results: ShowSearchResults,
  preview_note: PreviewNote,
  show_diary: ShowDiary,
  show_reflection: ShowReflection,
  show_note: ShowNote,
  propose_reschedule: ProposeReschedule,
  propose_tasks: ProposeTasks,
};

export const ACTIONS_BY_SCOPE: Record<Scope, string[]> = {
  chat: Object.keys(ACTION_COMPONENTS),
  reminders: ['show_reminders', 'delete_reminder', 'propose_reschedule'],
  diary: ['checkin', 'show_mood_chart', 'show_diary', 'show_reflection'],
  notes: ['show_search_results', 'preview_note', 'show_note', 'propose_tasks'],
};

/** Registers only this scope's actions, plus what the app tells Clio about the screen. Render inside that scope's provider. */
export function ClioActions({ scope, shareOn = false, timezone }: { scope: Scope; shareOn?: boolean; timezone: string }) {
  const location = useLocation();
  useCopilotReadable({
    description: 'Current date, the screen the owner is looking at, and which part of the app this conversation belongs to',
    value: { today: todayIn(timezone), timezone, route: location.pathname, scope },
  });
  const names = ACTIONS_BY_SCOPE[scope] ?? [];
  return (
    <>
      {names.map((name) => {
        const Component = ACTION_COMPONENTS[name];
        return Component ? <Component key={name} timezone={timezone} shareOn={shareOn} /> : null;
      })}
    </>
  );
}
