import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import AvatarMenu, { type AvatarMenuProps } from './AvatarMenu';

export type HeaderStatus = 'online' | 'offline' | 'syncing';

const STATUS_LABEL: Record<HeaderStatus, string> = {
  online: 'AI Core',
  offline: 'Offline',
  syncing: 'Syncing…',
};

export interface AppHeaderProps extends AvatarMenuProps {
  status: HeaderStatus;
  onSearch: () => void;
  children?: ReactNode;
}

export default function AppHeader({ status, onSearch, children, onEnableNotifications, onInstall }: AppHeaderProps) {
  return (
    <header className="glass z-30 shrink-0 border-b border-hairline">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--primary)]">Clio</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-inset px-2.5 py-1 text-xs font-semibold text-ink-soft">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ember" />
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {children}
          <button
            type="button"
            aria-label="Search notes"
            onClick={onSearch}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <Search size={20} />
          </button>
          <AvatarMenu onEnableNotifications={onEnableNotifications} onInstall={onInstall} />
        </div>
      </div>
    </header>
  );
}
