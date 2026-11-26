import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import NotificationManager from './components/features/NotificationManager';
import AppHeader, { type HeaderStatus } from './components/layout/AppHeader';
import CosmicBackdrop from './components/layout/CosmicBackdrop';
import BottomNavigation, { NAV_OFFSET } from './components/layout/BottomNavigation';
import InstallModal from './components/ui/InstallModal';
import { ToastProvider, useToast } from './components/ui/Toast';
import { ScopedCopilot } from './copilot/ScopedCopilot';
import { useReminders } from './hooks/useReminders';
import { completeReminder, snoozeReminder } from './lib/clioApi';
import type { Scope } from './lib/types';
import { outbox } from './offline';
import { useOnlineSync } from './offline/useOnlineSync';
import ChatPage from './pages/ChatPage';
import DiaryPage from './pages/DiaryPage';
import NotesPage from './pages/NotesPage';
import RemindersPage from './pages/RemindersPage';
import SettingsPage from './pages/SettingsPage';
import BackupRestorePage from './pages/BackupRestorePage';
import PrivacyPage from './pages/PrivacyPage';
import { deleteAlarm, requestNotificationPermission, upsertAlarm } from './utils/notificationSync';
import { removeNotificationForReminder, updateNotificationForReminder } from './utils/notifications';

type LegacyReminder = { id: string; completed?: boolean; dueDate: string; snoozedUntil?: string | null };

const SCOPES: Scope[] = ['chat', 'diary', 'reminders', 'notes'];
const PAGES: Record<Scope, ReactNode> = {
  chat: <ChatPage />,
  diary: <DiaryPage />,
  reminders: <RemindersPage />,
  notes: <NotesPage />,
};
/** Readable widths on wide screens: conversation and journal stay narrow; notes get room for a grid. */
const SCOPE_WIDTH: Record<Scope, string> = {
  chat: 'max-w-3xl',
  diary: 'max-w-3xl',
  reminders: 'max-w-4xl',
  notes: 'max-w-6xl',
};

function BackBar({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-4 md:px-6">
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm mb-3 gap-2" aria-label="Go back">
        <ArrowLeft size={18} /> Back
      </button>
      {children}
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast() as { addToast: (msg: string, type?: string) => void };
  // Refetches on every 'reminders' data change, so the alarm and notification effects below run on fresh data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { reminders, loading } = useReminders() as any;
  const { pending, rejected } = useOnlineSync(outbox);
  useEffect(() => {
    if (rejected > 0) toast.addToast("Some offline changes couldn't be applied (the reminder was changed or removed elsewhere).", 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejected]);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const status: HeaderStatus = !online ? 'offline' : pending > 0 ? 'syncing' : 'online';

  const segment = location.pathname.slice(1);
  const activeScope: Scope | null = (SCOPES as string[]).includes(segment) ? (segment as Scope) : null;
  const goBack = (fallback: string) => () => (window.history.length > 1 ? navigate(-1) : navigate(fallback));

  // Notifications and alarms follow the reminder list. Only reminders whose timing or state changed since the last
  // sync are touched (so a refetch doesn't re-fire notifications for overdue ones); gone ones lose their alarm.
  const synced = useRef(new Map<string, string>());
  useEffect(() => {
    if (loading) return;
    const seen = new Set<string>();
    for (const r of reminders as LegacyReminder[]) {
      seen.add(r.id);
      const sig = `${Boolean(r.completed)}|${r.dueDate}|${r.snoozedUntil ?? ''}`;
      if (synced.current.get(r.id) === sig) continue;
      synced.current.set(r.id, sig);
      if (r.completed) {
        removeNotificationForReminder(r.id);
        void deleteAlarm(r.id);
      } else {
        const snoozed = r.snoozedUntil && new Date(r.snoozedUntil).getTime() > Date.now();
        updateNotificationForReminder(snoozed ? { ...r, dueDate: r.snoozedUntil } : r);
        void upsertAlarm(r);
      }
    }
    for (const id of [...synced.current.keys()]) {
      if (seen.has(id)) continue;
      synced.current.delete(id);
      removeNotificationForReminder(id);
      void deleteAlarm(id);
    }
  }, [loading, reminders]);

  // Actions fired from notification buttons. Narrow server calls (never a full PUT of a possibly stale copy);
  // both emit 'reminders', which refreshes the list above and every mounted tab.
  useEffect(() => {
    const onComplete = (e: Event) => {
      void completeReminder((e as CustomEvent).detail.reminderId).catch(() => toast.addToast("Couldn't complete that reminder", 'error'));
    };
    const onSnooze = (e: Event) => {
      const { reminderId, snoozeUntil } = (e as CustomEvent).detail;
      void snoozeReminder(reminderId, new Date(snoozeUntil).toISOString()).catch(() => toast.addToast("Couldn't snooze that reminder", 'error'));
    };
    window.addEventListener('complete-reminder-app', onComplete);
    window.addEventListener('snooze-reminder-app', onSnooze);
    return () => {
      window.removeEventListener('complete-reminder-app', onComplete);
      window.removeEventListener('snooze-reminder-app', onSnooze);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enableNotifications = async () => {
    const result = await requestNotificationPermission();
    if (result === 'granted') toast.addToast('Notifications enabled', 'success');
    else toast.addToast('Notifications not enabled', 'error');
  };

  // PWA install
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferInstall, setDeferInstall] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [hasEngaged, setHasEngaged] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferInstall(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const installTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasEngaged && deferInstall) {
      setHasEngaged(true);
      installTimer.current = setTimeout(() => setShowInstallModal(true), 2000);
    }
  }, [hasEngaged, deferInstall]);
  // Only clear the timer on unmount; the effect above re-runs when hasEngaged flips.
  useEffect(() => () => { if (installTimer.current) clearTimeout(installTimer.current); }, []);

  const install = async () => {
    if (!deferInstall) return;
    deferInstall.prompt();
    await deferInstall.userChoice;
    setDeferInstall(null);
    setShowInstallModal(false);
  };

  return (
    <div className="app-container relative flex h-[100dvh] flex-col text-ink">
      <CosmicBackdrop />
      <AppHeader
        status={status}
        onEnableNotifications={enableNotifications}
        onInstall={deferInstall ? install : null}
      />
      {showInstallModal && <InstallModal onInstall={install} onDismiss={() => setShowInstallModal(false)} />}

      <main className={`relative z-10 min-h-0 flex-1 ${activeScope === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'} ${activeScope ? `pb-20 md:pb-0 ${NAV_OFFSET}` : ''}`}>
        {SCOPES.map((scope) => (
          <div key={scope} hidden={activeScope !== scope} className={`mx-auto w-full ${SCOPE_WIDTH[scope]} ${scope === 'chat' ? 'h-full min-h-0' : ''}`}>
            <ScopedCopilot scope={scope}>{PAGES[scope]}</ScopedCopilot>
          </div>
        ))}
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          {SCOPES.map((s) => (
            <Route key={s} path={`/${s}`} element={null} />
          ))}
          <Route
            path="/settings"
            element={<BackBar onBack={goBack('/chat')}><SettingsPage /></BackBar>}
          />
          <Route
            path="/backup"
            element={<BackBar onBack={goBack('/chat')}><BackupRestorePage onToast={toast.addToast} /></BackBar>}
          />
          <Route path="/restore" element={<Navigate to="/backup" replace />} />
          <Route
            path="/privacy"
            element={<BackBar onBack={goBack('/chat')}><PrivacyPage /></BackBar>}
          />
          <Route path="/reminders/new" element={<Navigate to="/reminders?new=1" replace />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>

      <NotificationManager />
      {activeScope && <BottomNavigation activeTab={activeScope} onTabChange={(id) => navigate(`/${id}`)} />}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
