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
}

export interface DaySummary {
  date: string;
  mood: number | null;
  energy: number | null;
  headline: string;
  /** True even when all section counts are zero (mood-only days). */
  hasEntry: boolean;
  sections: { thoughts: number; ideas: number; events: number };
}
