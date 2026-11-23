import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import { useLocation } from 'react-router-dom';
import { CheckinForm, type CheckinValues } from '../components/gen/CheckinForm';
import { ConfirmCard } from '../components/gen/ConfirmCard';
import { MoodChart } from '../components/gen/MoodChart';
import { NotePreview } from '../components/gen/NotePreview';
import { ReminderCards } from '../components/gen/ReminderCards';
import { SearchResults } from '../components/gen/SearchResults';
import { apiFetch } from '../lib/api';
import type { Hit, MoodPoint, Reminder } from '../lib/types';

const dayKey = (d: Date) => d.toLocaleDateString('en-CA');

/** Saves a check-in: one request for the mood and one per non-empty text field. */
export async function saveCheckin(date: string, v: CheckinValues): Promise<void> {
  await apiFetch(`/api/daily/${date}/entries`, { method: 'POST', json: { mood: v.mood } });
  const fields: Array<['events' | 'thoughts' | 'ideas', string]> = [['events', v.events], ['thoughts', v.thoughts], ['ideas', v.ideas]];
  for (const [section, text] of fields) {
    if (text.trim()) await apiFetch(`/api/daily/${date}/entries`, { method: 'POST', json: { section, text } });
  }
}

/** Registers what Clio can show in chat and what the app tells Clio about the screen. */
export function ClioActions({ shareOn }: { shareOn: boolean }) {
  const location = useLocation();
  useCopilotReadable({
    description: 'Current date and the screen the owner is looking at',
    value: { today: dayKey(new Date()), route: location.pathname },
  });

  useCopilotAction({
    name: 'show_reminders',
    description: 'Show the owner\'s upcoming (not done) reminders as cards.',
    parameters: [],
    handler: async () => apiFetch<Reminder[]>('/api/reminders?done=false'),
    render: ({ status, result }) => {
      if (status !== 'complete') return <p className="text-sm opacity-70">Looking up reminders…</p>;
      const reminders = (result as Reminder[]) ?? [];
      return (
        <ReminderCards
          reminders={reminders}
          onComplete={(id) => { void apiFetch(`/api/reminders/${id}/complete`, { method: 'POST' }); }}
          onSnooze={(id, until) => { void apiFetch(`/api/reminders/${id}/snooze`, { method: 'POST', json: { until } }); }}
        />
      );
    },
  });

  useCopilotAction({
    name: 'show_mood_chart',
    description: 'Show a chart of the owner\'s mood for the last N days (default 14).',
    parameters: [{ name: 'days', type: 'number', description: 'How many days back', required: false }],
    handler: async ({ days }) => {
      const n = Math.min(Math.max(Math.round(days ?? 14), 2), 90);
      const to = new Date();
      const from = new Date(Date.now() - (n - 1) * 86400000);
      return apiFetch<MoodPoint[]>(`/api/analytics/mood?from=${dayKey(from)}&to=${dayKey(to)}`);
    },
    render: ({ status, result }) =>
      status !== 'complete' ? <p className="text-sm opacity-70">Loading mood…</p> : <MoodChart series={(result as MoodPoint[]) ?? []} />,
  });

  useCopilotAction({
    name: 'show_search_results',
    description: 'Search the owner\'s notes and show matching notes as cards.',
    parameters: [{ name: 'query', type: 'string', description: 'Words to look for', required: true }],
    handler: async ({ query }) => apiFetch<Hit[]>(`/api/search?q=${encodeURIComponent(query)}${shareOn ? '&includePrivate=true' : ''}`),
    render: ({ status, result }) =>
      status !== 'complete' ? <p className="text-sm opacity-70">Searching…</p> : <SearchResults hits={(result as Hit[]) ?? []} />,
  });

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
              await saveCheckin(dayKey(new Date()), v);
              respond?.(`Check-in saved (mood ${v.mood}).`);
            } catch (e) {
              respond?.(`Saving failed: ${(e as Error).message}`);
            }
          }}
        />
      );
    },
  });

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

  useCopilotAction({
    name: 'delete_reminder',
    description: 'Delete a reminder after the owner approves.',
    parameters: [
      { name: 'id', type: 'string', description: 'Reminder id', required: true },
      { name: 'title', type: 'string', description: 'Reminder title, for the confirmation card', required: true },
    ],
    renderAndWaitForResponse: ({ status, args, respond }) => {
      if (status === 'complete') return <p className="text-sm opacity-70">Done.</p>;
      return (
        <ConfirmCard
          title="Delete this reminder?"
          detail={String(args.title ?? '')}
          onCancel={() => respond?.('cancelled')}
          onApprove={async () => {
            try {
              await apiFetch(`/api/reminders/${args.id}`, { method: 'DELETE' });
              respond?.('deleted');
            } catch (e) {
              respond?.(`Delete failed: ${(e as Error).message}`);
            }
          }}
        />
      );
    },
  });

  return null;
}
