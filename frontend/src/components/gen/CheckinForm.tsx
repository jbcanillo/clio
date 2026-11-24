import { useState } from 'react';

export interface CheckinValues {
  mood: 1 | 2 | 3 | 4 | 5;
  events: string;
  thoughts: string;
  ideas: string;
}
interface Props {
  onSubmit: (v: CheckinValues) => void;
  onSkip: () => void;
}

const FACES = ['😞', '🙁', '😐', '🙂', '😄'];

export function CheckinForm({ onSubmit, onSkip }: Props) {
  const [mood, setMood] = useState<CheckinValues['mood'] | null>(null);
  const [events, setEvents] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [ideas, setIdeas] = useState('');

  return (
    <form
      className="rounded-2xl bg-card shadow-card p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (mood) onSubmit({ mood, events, thoughts, ideas });
      }}
    >
      <div role="radiogroup" aria-label="How are you feeling?" className="flex justify-between">
        {FACES.map((face, i) => {
          const value = (i + 1) as CheckinValues['mood'];
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mood === value}
              aria-label={`Mood ${value}`}
              className={`btn btn-circle ${mood === value ? 'border-0 bg-teal text-on-teal' : 'btn-ghost bg-inset'}`}
              onClick={() => setMood(value)}
            >
              {face}
            </button>
          );
        })}
      </div>
      <label className="block text-sm text-ink-soft">
        What happened today?
        <textarea className="textarea w-full mt-1 bg-inset border-hairline text-ink" rows={2} value={events} onChange={(e) => setEvents(e.target.value)} />
      </label>
      <label className="block text-sm text-ink-soft">
        Thoughts
        <textarea className="textarea w-full mt-1 bg-inset border-hairline text-ink" rows={2} value={thoughts} onChange={(e) => setThoughts(e.target.value)} />
      </label>
      <label className="block text-sm text-ink-soft">
        Ideas
        <textarea className="textarea w-full mt-1 bg-inset border-hairline text-ink" rows={2} value={ideas} onChange={(e) => setIdeas(e.target.value)} />
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn btn-ghost btn-sm text-[var(--primary)]" onClick={onSkip}>Skip today</button>
        <button type="submit" className="btn btn-sm h-12 min-h-12 rounded-full border-0 bg-teal px-6 text-on-teal hover:opacity-90 disabled:opacity-40" disabled={!mood}>Save check-in</button>
      </div>
    </form>
  );
}
