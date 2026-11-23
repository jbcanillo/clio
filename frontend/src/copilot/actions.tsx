import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckinForm, type CheckinValues } from '../components/gen/CheckinForm';
import { ConfirmCard } from '../components/gen/ConfirmCard';
import { MoodChart } from '../components/gen/MoodChart';
import { NotePreview } from '../components/gen/NotePreview';
import { ReminderCards } from '../components/gen/ReminderCards';
import { SearchResults } from '../components/gen/SearchResults';
import { apiFetch } from '../lib/api';
import { completeReminder, listReminders, snoozeReminder } from '../lib/clioApi';
import { addDays, todayIn } from '../lib/today';
import type { Hit, MoodPoint, Reminder, Scope } from '../lib/types';

const quiet = (text: string) => <p className="text-sm opacity-70">{text}</p>;

/*
 * What the model is told after a "show ..." action is a fixed sentence. The cards below load their own
 * data for the owner, so note text never travels back to the model through a tool result.
 */
function LiveReminders() {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  useEffect(() => { listReminders({ done: false }).then(setReminders).catch(() => setReminders([])); }, []);
  if (!reminders) return quiet('Looking up remindersâ€¦');
  return (
    <ReminderCards
      reminders={reminders}
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
  return series ? <MoodChart series={series} /> : quiet('Loading moodâ€¦');
}

function LiveSearch({ query, includePrivate }: { query: string; includePrivate: boolean }) {
  const [hits, setHits] = useState<Hit[] | null>(null);
  useEffect(() => {
    apiFetch<Hit[]>(`/api/search?q=${encodeURIComponent(query)}${includePrivate ? '&includePrivate=true' : ''}`).then(setHits).catch(() => setHits([]));
  }, [query, includePrivate]);
  return hits ? <SearchResults hits={hits} /> : quiet('Searchingâ€¦');
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
  if (state === null) return quiet('Checking the reminderâ€¦');
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
          await apiFetch(`/api/reminders/${id}`, { method: 'DELETE' });
          respond?.('deleted');
        } catch (e) {
          respond?.(`Delete failed: ${(e as Error).message}`);
        }
      }}
    />
  );
}

/** Saves a check-in: one request for the mood and one per non-empty text field. */
export async function saveCheckin(date: string, v: CheckinValues): Promise<void> {
  await apiFetch(`/api/daily/${date}/entries`, { method: 'POST', json: { mood: v.mood } });
  const fields: Array<['events' | 'thoughts' | 'ideas', string]> = [['events', v.events], ['thoughts', v.thoughts], ['ideas', v.ideas]];
  for (const [section, text] of fields) {
    if (text.trim()) await apiFetch(`/api/daily/${date}/entries`, { method: 'POST', json: { section, text } });
  }
}

type ActionProps = { timezone: string; shareOn: boolean };

function ShowReminders() {
  useCopilotAction({
    name: 'show_reminders',
    description: "Show the owner's upcoming (not done) reminders as cards.",
    parameters: [],
    handler: async () => 'Showing the reminders to the owner.',
    render: ({ status }) => (status === 'complete' ? <LiveReminders /> : quiet('Looking up reminders…')),
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
};

export const ACTIONS_BY_SCOPE: Record<Scope, string[]> = {
  chat: ['show_reminders', 'delete_reminder', 'show_mood_chart', 'checkin', 'show_search_results', 'preview_note'],
  reminders: ['show_reminders', 'delete_reminder'],
  diary: ['checkin', 'show_mood_chart'],
  notes: ['show_search_results', 'preview_note'],
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
