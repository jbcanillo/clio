import { useState } from 'react';
import type { PhotoItem } from '../../lib/media';
import type { Person, Place } from '../../lib/types';
import { PeoplePicker } from '../media/PeoplePicker';
import { PhotoPicker } from '../media/PhotoPicker';
import { PlacePicker } from '../media/PlacePicker';

export interface CheckinValues {
  mood: 1 | 2 | 3 | 4 | 5;
  /** One entry per line. */
  events: string;
  thoughts: string;
  ideas: string;
  photos: PhotoItem[];
  people: Person[];
  places: Place[];
}
interface Props {
  onSubmit: (v: CheckinValues) => void | Promise<void>;
  /** "Skip today" on a new check-in; "Cancel" when editing. */
  onSkip: () => void;
  /** Editing a logged day: the form starts from it. */
  initial?: Partial<CheckinValues>;
  submitLabel?: string;
  skipLabel?: string;
}

const FACES = ['😞', '🙁', '😐', '🙂', '😄'];
const sectionLabel = 'block text-xs font-semibold uppercase tracking-wide text-ink-muted';

export function CheckinForm({ onSubmit, onSkip, initial, submitLabel = 'Save check-in', skipLabel = 'Skip today' }: Props) {
  const [mood, setMood] = useState<CheckinValues['mood'] | null>(initial?.mood ?? null);
  const [events, setEvents] = useState(initial?.events ?? '');
  const [thoughts, setThoughts] = useState(initial?.thoughts ?? '');
  const [ideas, setIdeas] = useState(initial?.ideas ?? '');
  const [photos, setPhotos] = useState<PhotoItem[]>(initial?.photos ?? []);
  const [people, setPeople] = useState<Person[]>(initial?.people ?? []);
  const [places, setPlaces] = useState<Place[]>(initial?.places ?? []);
  const [busy, setBusy] = useState(false);
  const editing = initial !== undefined;

  return (
    <form
      className="rounded-2xl bg-card shadow-card p-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!mood || busy) return;
        setBusy(true);
        try {
          await onSubmit({ mood, events, thoughts, ideas, photos, people, places });
        } finally {
          setBusy(false);
        }
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
        <textarea className="textarea w-full mt-1 bg-inset border-hairline text-ink" rows={editing ? 3 : 2} value={events} onChange={(e) => setEvents(e.target.value)} />
      </label>
      <label className="block text-sm text-ink-soft">
        Thoughts
        <textarea className="textarea w-full mt-1 bg-inset border-hairline text-ink" rows={editing ? 3 : 2} value={thoughts} onChange={(e) => setThoughts(e.target.value)} />
      </label>
      <label className="block text-sm text-ink-soft">
        Ideas
        <textarea className="textarea w-full mt-1 bg-inset border-hairline text-ink" rows={editing ? 3 : 2} value={ideas} onChange={(e) => setIdeas(e.target.value)} />
      </label>
      {editing ? <p className="text-[11px] text-ink-muted">Each line is its own entry.</p> : null}

      <div className="space-y-3 border-t border-hairline pt-3">
        <div className="space-y-1.5">
          <span className={sectionLabel}>Photos</span>
          <PhotoPicker value={photos} onChange={setPhotos} />
        </div>
        <div className="space-y-1.5">
          <span className={sectionLabel}>People</span>
          <PeoplePicker value={people} onChange={setPeople} />
        </div>
        <div className="space-y-1.5">
          <span className={sectionLabel}>Places</span>
          <PlacePicker value={places} onChange={setPlaces} />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" className="btn btn-ghost btn-sm text-[var(--primary)]" onClick={onSkip}>{skipLabel}</button>
        <button type="submit" className="btn h-12 min-h-12 rounded-xl border-0 bg-teal px-6 text-on-teal hover:opacity-90 disabled:opacity-40" disabled={!mood || busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
