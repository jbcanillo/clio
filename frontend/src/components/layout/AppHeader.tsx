import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AvatarMenu, { type AvatarMenuProps } from './AvatarMenu';

export type HeaderStatus = 'online' | 'offline' | 'syncing';

// Only abnormal states get a pill; when online with nothing pending the header stays quiet.
const STATUS_LABEL: Record<HeaderStatus, string | null> = {
  online: null,
  offline: 'Offline',
  syncing: 'Syncing…',
};

export interface AppHeaderProps extends AvatarMenuProps {
  status: HeaderStatus;
  children?: ReactNode;
}

export default function AppHeader({ status, children, onEnableNotifications, onInstall }: AppHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="glass relative z-30 shrink-0 border-b border-hairline">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" width={32} height={32} className="brand-medallion h-8 w-8" />
            <h1 className="brand-wordmark text-xl leading-none">Clio</h1>
          </div>
          {STATUS_LABEL[status] && (
            <span role="status" className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-inset px-2.5 py-1 text-xs font-semibold text-ink-soft">
              <span aria-hidden="true" className="glow-ember h-2 w-2 rounded-full bg-ember" />
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {children}
          <button
            type="button"
            aria-label="Privacy notice"
            title="Privacy notice"
            onClick={() => navigate('/privacy')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <ShieldCheck aria-hidden="true" size={22} />
          </button>
          <AvatarMenu onEnableNotifications={onEnableNotifications} onInstall={onInstall} />
        </div>
      </div>
    </header>
  );
}
