import { AlarmClock, BookOpen, Sparkles, StickyNote, type LucideIcon } from 'lucide-react';
import type { Scope } from '../../lib/types';

const TABS: { id: Scope; label: string; Icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', Icon: Sparkles },
  { id: 'diary', label: 'Journal', Icon: BookOpen },
  { id: 'reminders', label: 'Reminders', Icon: AlarmClock },
  { id: 'notes', label: 'Notes', Icon: StickyNote },
];

export interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (id: Scope) => void;
}

const BottomNavigation = ({ activeTab, onTabChange }: BottomNavigationProps) => (
  <nav
    className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-hairline pb-[env(safe-area-inset-bottom)]"
    aria-label="Main navigation"
  >
    <div className="mx-auto flex max-w-3xl justify-around px-2 py-2">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={`flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
              active ? 'bg-teal/10 text-[var(--primary)]' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} className={active ? 'glow-teal' : undefined} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);

export default BottomNavigation;
