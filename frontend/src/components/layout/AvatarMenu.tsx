import { Bell, DatabaseBackup, Download, Lock, Menu, Moon, RotateCcw, Settings, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearToken } from '../../lib/api';
import { applyTheme, getInitialTheme, type Theme } from '../../lib/theme';
import { lockOutbox } from '../../offline/session';

export interface AvatarMenuProps {
  onEnableNotifications?: () => void;
  /** Present only when a beforeinstallprompt event was captured. */
  onInstall?: (() => void) | null;
}

export default function AvatarMenu({ onEnableNotifications, onInstall }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const choose = (fn: () => void) => () => { setOpen(false); triggerRef.current?.focus(); fn(); };
  const toggleTheme = () => {
    const next: Theme = theme === 'clio-dark' ? 'clio-light' : 'clio-dark';
    applyTheme(next);
    setTheme(next);
  };
  // Forget this tab's session and the offline-notes key; the auth gate shows the unlock screen.
  const lock = () => {
    lockOutbox();
    clearToken();
  };
  const canNotify = typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted';

  const item = (label: string, icon: ReactNode, onClick: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={choose(onClick)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-inset focus:bg-inset focus:outline-none"
    >
      <span aria-hidden="true" className="text-ink-soft">{icon}</span>
      {label}
    </button>
  );

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  };

  return (
    <div ref={ref} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        <Menu aria-hidden="true" size={22} />
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-hairline bg-card p-1.5 shadow-modal">
          {item('Lock', <Lock size={16} />, lock)}
          {item('Settings', <Settings size={16} />, () => navigate('/settings'))}
          {item('Backup', <DatabaseBackup size={16} />, () => navigate('/backup'))}
          {item('Restore', <RotateCcw size={16} />, () => navigate('/restore'))}
          {item(theme === 'clio-dark' ? 'Light mode' : 'Dark mode', theme === 'clio-dark' ? <Sun size={16} /> : <Moon size={16} />, toggleTheme)}
          {canNotify && onEnableNotifications && item('Enable notifications', <Bell size={16} />, onEnableNotifications)}
          {onInstall && item('Install app', <Download size={16} />, onInstall)}
        </div>
      )}
    </div>
  );
}
