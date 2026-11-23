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
