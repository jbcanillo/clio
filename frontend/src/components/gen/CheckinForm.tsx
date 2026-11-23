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
      className="card bg-base-200 p-4 space-y-3"
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
              className={`btn btn-circle ${mood === value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMood(value)}
            >
              {face}
            </button>
          );
        })}
      </div>
      <label className="block text-sm">
        What happened today?
        <textarea className="textarea textarea-bordered w-full mt-1" rows={2} value={events} onChange={(e) => setEvents(e.target.value)} />
      </label>
      <label className="block text-sm">
        Thoughts
        <textarea className="textarea textarea-bordered w-full mt-1" rows={2} value={thoughts} onChange={(e) => setThoughts(e.target.value)} />
      </label>
      <label className="block text-sm">
        Ideas
        <textarea className="textarea textarea-bordered w-full mt-1" rows={2} value={ideas} onChange={(e) => setIdeas(e.target.value)} />
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip}>Skip today</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!mood}>Save check-in</button>
      </div>
    </form>
  );
}
