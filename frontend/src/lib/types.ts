export type Priority = 'low' | 'medium' | 'high';
export type Repeat = 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Reminder {
  id: string;
  title: string;
  due: string;
  priority: Priority;
  repeat: Repeat;
  done: boolean;
  snoozedUntil?: string;
  completedAt?: string;
  notes: string;
  /** Free-form extras: photos (attachment file names), contact, location, checklist… */
  extras?: Record<string, unknown>;
}

/** Someone attached to a check-in or reminder. */
export interface Person {
  name: string;
  phone?: string;
  email?: string;
}

/** A pinned place. */
export interface Place {
  lat: number;
  lng: number;
  label?: string;
}

export interface Hit {
  path: string;
  title: string;
  snippet: string;
  score: number;
  private: boolean;
  date?: string;
}

export interface MoodPoint {
  date: string;
  mood: number | null;
  energy?: number | null;
}

export type Scope = 'chat' | 'diary' | 'reminders' | 'notes';

export interface NoteSummary {
  path: string;
  title: string;
  tags: string[];
  snippet: string;
  updated: string;
  hash: string;
  checklist: { index: number; text: string; done: boolean }[];
  /** Attachment file names linked from the note body. */
  photos?: string[];
}

export interface DaySummary {
  date: string;
  mood: number | null;
  energy: number | null;
  headline: string;
  /** True even when all section counts are zero (mood-only days). */
  hasEntry: boolean;
  sections: { thoughts: number; ideas: number; events: number };
  photos?: string[];
  people?: string[];
  places?: Place[];
}
