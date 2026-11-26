import { User } from 'lucide-react';
import type { Person } from '../../lib/types';
import { Chip } from './Chip';

/** "Name · phone · email": everything known about a person, on one line. Plain names (older data) work too. */
export function personLabel(p: Person | string): string {
  if (typeof p === 'string') return p;
  return [p.name, p.phone, p.email].map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).join(' · ');
}

export function PersonChip({ person }: { person: Person | string }) {
  return <Chip icon={<User size={12} />}>{personLabel(person)}</Chip>;
}
