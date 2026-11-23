import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AddReminderForm from './components/features/AddReminderForm';
import BackupRestorePage from './components/features/BackupRestorePage';
import NotificationManager from './components/features/NotificationManager';
import AppHeader, { type HeaderStatus } from './components/layout/AppHeader';
import BottomNavigation from './components/layout/BottomNavigation';
import InstallModal from './components/ui/InstallModal';
import { ToastProvider, useToast } from './components/ui/Toast';
import { ScopedCopilot } from './copilot/ScopedCopilot';
import { useReminders } from './hooks/useReminders';
import type { Scope } from './lib/types';
import { outbox } from './offline';
import { useOnlineSync } from './offline/useOnlineSync';
import ChatPage from './pages/ChatPage';
import DiaryPage from './pages/DiaryPage';
import NotesPage from './pages/NotesPage';
import RemindersPage from './pages/RemindersPage';
import SettingsPage from './pages/SettingsPage';
import { deleteAlarm, requestNotificationPermission, upsertAlarm } from './utils/notificationSync';
import { addNotificationForReminder, initializeNotifications } from './utils/notifications';

const SCOPES: Scope[] = ['chat', 'diary', 'reminders', 'notes'];
const PAGES: Record<Scope, ReactNode> = {
  chat: <ChatPage />,
  diary: <DiaryPage />,
  reminders: <RemindersPage />,
  notes: <NotesPage />,
};

function BackBar({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { reminders, loading, createReminder, updateReminder, completeReminder } = useReminders() as any;
  const { pending } = useOnlineSync(outbox);
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

  // Notifications and alarms follow the reminder list.
  useEffect(() => {
    if (!loading && reminders.length > 0) initializeNotifications(reminders);
  }, [loading, reminders]);

  useEffect(() => {
    const sync = async () => {
      if (!reminders || reminders.length === 0) return;
      for (const r of reminders) {
        if (r.completed) await deleteAlarm(r.id);
        else await upsertAlarm(r);
      }
    };
    void sync();
  }, [reminders]);

  // Actions fired from notification buttons.
  useEffect(() => {
    const onComplete = (e: Event) => completeReminder((e as CustomEvent).detail.reminderId);
    const onSnooze = (e: Event) => {
      const { reminderId, snoozeUntil } = (e as CustomEvent).detail;
      const reminder = reminders.find((r: { id: string }) => r.id === reminderId);
      if (reminder) updateReminder({ ...reminder, snoozedUntil: snoozeUntil });
    };
    window.addEventListener('complete-reminder-app', onComplete);
    window.addEventListener('snooze-reminder-app', onSnooze);
    return () => {
      window.removeEventListener('complete-reminder-app', onComplete);
      window.removeEventListener('snooze-reminder-app', onSnooze);
    };
  }, [reminders, completeReminder, updateReminder]);

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
    <div className="app-container flex h-[100dvh] flex-col bg-canvas text-ink">
      <AppHeader
        status={status}
        onSearch={() => navigate('/notes?focus=search')}
        onEnableNotifications={enableNotifications}
        onInstall={deferInstall ? install : null}
      />
      {showInstallModal && <InstallModal onInstall={install} onDismiss={() => setShowInstallModal(false)} />}

      <main className={`min-h-0 flex-1 overflow-y-auto ${activeScope ? 'pb-20' : ''}`}>
        {SCOPES.map((scope) => (
          <div key={scope} hidden={activeScope !== scope}>
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
            element={
              <BackBar onBack={goBack('/chat')}>
                <BackupRestorePage mode="backup" onBack={goBack('/chat')} onToast={toast.addToast} />
              </BackBar>
            }
          />
          <Route
            path="/restore"
            element={
              <BackBar onBack={goBack('/chat')}>
                <BackupRestorePage mode="restore" onBack={goBack('/chat')} onToast={toast.addToast} />
              </BackBar>
            }
          />
          <Route
            path="/reminders/new"
            element={
              <BackBar onBack={goBack('/reminders')}>
                <AddReminderForm
                  asPage
                  onDismiss={goBack('/reminders')}
                  onToast={toast.addToast}
                  onSubmit={async (data: unknown) => {
                    const created = await createReminder(data);
                    if (created) addNotificationForReminder(created);
                    goBack('/reminders')();
                  }}
                />
              </BackBar>
            }
          />
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
