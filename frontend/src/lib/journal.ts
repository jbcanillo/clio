import type { CheckinValues } from '../components/gen/CheckinForm';
import { writeOrQueue } from '../offline/instances';
import type { DailyEntry, DayEdit } from '../offline/opsOutbox';
import { apiFetch } from './api';
import { emitDataChanged } from './dataEvents';
import { savePhotoItems } from './media';
import type { Person, Place } from './types';

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** Adds a check-in to a day. Each part is queued on its own when offline and synced to the right day later. */
export async function saveCheckin(date: string, v: CheckinValues): Promise<void> {
  try {
    const append = (entry: DailyEntry) =>
      writeOrQueue(
        { kind: 'daily.append', date, entry },
        async () => { await apiFetch(`/api/daily/${date}/entries`, { method: 'POST', json: entry }); },
        () => undefined,
        'daily',
      );
    await append({ mood: v.mood });
    const fields: Array<['events' | 'thoughts' | 'ideas', string]> = [['events', v.events], ['thoughts', v.thoughts], ['ideas', v.ideas]];
    for (const [section, text] of fields) for (const line of lines(text)) await append({ section, text: line });
    for (const photo of await savePhotoItems(v.photos ?? [])) await append({ photo });
    for (const person of v.people ?? []) await append({ person });
    for (const place of v.places ?? []) await append({ place });
  } finally {
    emitDataChanged('daily');
  }
}

/** GET /api/daily/:date, as the edit form needs it. */
export interface DayDetail {
  date: string;
  exists: boolean;
  hash?: string;
  frontmatter?: { mood?: number };
  entries?: { events: string[]; thoughts: string[]; ideas: string[]; photos: string[]; people: Person[]; places: Place[] } | null;
}

/** Loads a logged day for editing (from the offline copy when there is no connection). */
export async function loadDay(date: string): Promise<{ values: Partial<CheckinValues>; baseHash: string | null }> {
  const d = await apiFetch<DayDetail>(`/api/daily/${date}`);
  if (d.exists && !d.entries) throw new Error("This day's note can't be read here; fix it in Obsidian first.");
  const e = d.entries ?? { events: [], thoughts: [], ideas: [], photos: [], people: [], places: [] };
  const mood = d.frontmatter?.mood;
  return {
    baseHash: d.exists ? d.hash ?? null : null,
    values: {
      ...(typeof mood === 'number' && mood >= 1 && mood <= 5 ? { mood: mood as CheckinValues['mood'] } : {}),
      events: e.events.join('\n'),
      thoughts: e.thoughts.join('\n'),
      ideas: e.ideas.join('\n'),
      photos: e.photos.map((file) => ({ file })),
      people: e.people,
      places: e.places,
    },
  };
}

/**
 * Saves an edited day. Refused with a clear message when the day changed elsewhere since it was opened.
 * Offline it is queued (a later offline edit of the same day replaces it).
 */
export async function updateCheckin(date: string, v: CheckinValues, baseHash: string | null): Promise<void> {
  const day: DayEdit = {
    baseHash,
    mood: v.mood,
    events: lines(v.events),
    thoughts: lines(v.thoughts),
    ideas: lines(v.ideas),
    photos: await savePhotoItems(v.photos),
    people: v.people,
    places: v.places,
  };
  try {
    await writeOrQueue(
      { kind: 'daily.replace', date, day },
      async () => { await apiFetch(`/api/daily/${date}`, { method: 'PUT', json: day }); },
      () => undefined,
      'daily',
    );
  } catch (e) {
    if ((e as { status?: number }).status === 409) throw new Error('This day changed somewhere else. Close and open it again to see the latest.');
    throw e;
  } finally {
    emitDataChanged('daily');
  }
}
