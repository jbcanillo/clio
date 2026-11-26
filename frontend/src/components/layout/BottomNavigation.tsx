import { AlarmClock, BookOpen, Sparkles, StickyNote, type LucideIcon } from 'lucide-react';
import type { Scope } from '../../lib/types';

const TABS: { id: Scope; label: string; Icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', Icon: Sparkles },
  { id: 'diary', label: 'Journal', Icon: BookOpen },
  { id: 'reminders', label: 'Reminders', Icon: AlarmClock },
  { id: 'notes', label: 'Notes', Icon: StickyNote },
];

/**
 * Space the main content leaves for the navigation once it becomes a side rail
 * (tablet: narrow rail with icons; desktop: wider rail with labels beside them).
 */
export const NAV_OFFSET = 'md:pl-24 lg:pl-60';

export interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (id: Scope) => void;
}

/** Tab bar at the bottom on phones; a side rail under the header on tablets and desktops. */
const BottomNavigation = ({ activeTab, onTabChange }: BottomNavigationProps) => (
  <nav
    className="glass fixed bottom-0 left-0 right-0 z-40 md:z-20 border-t border-hairline pb-[env(safe-area-inset-bottom)]
      md:bottom-0 md:right-auto md:top-14 md:w-24 md:border-r md:border-t-0 md:pb-0 lg:w-60"
    aria-label="Main navigation"
  >
    <div className="mx-auto flex max-w-3xl justify-around px-2 py-2 md:mx-0 md:h-full md:max-w-none md:flex-col md:justify-start md:gap-1.5 md:px-3 md:py-4">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={`flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal
              md:w-full md:min-w-0 md:py-2.5 lg:flex-row lg:gap-3 lg:px-4 lg:text-sm ${
              active ? 'bg-teal/10 text-[var(--primary)]' : 'text-ink-muted hover:bg-inset hover:text-ink'
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
