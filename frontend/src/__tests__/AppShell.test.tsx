import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HashRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mounts: string[] = [];
vi.mock('../copilot/ScopedCopilot', async () => {
  const React = await import('react');
  return {
    ScopedCopilot: ({ scope, children }: { scope: string; children: React.ReactNode }) => {
      React.useEffect(() => { mounts.push(scope); }, [scope]);
      return <div data-testid={`scope-${scope}`}>{children}</div>;
    },
  };
});
vi.mock('../pages/ChatPage', () => ({ default: () => <section aria-label="Chat page" /> }));
vi.mock('../pages/RemindersPage', () => ({ default: () => <section aria-label="Reminders" /> }));
vi.mock('../pages/DiaryPage', () => ({ default: () => <section aria-label="Diary" /> }));
vi.mock('../pages/SettingsPage', () => ({ default: () => <section aria-label="Settings page" /> }));
vi.mock('../components/features/NotificationManager', () => ({ default: () => null }));
vi.mock('../components/features/BackupRestorePage', () => ({ default: () => <section aria-label="Backup page" /> }));
vi.mock('../hooks/useReminders', () => ({
  useReminders: () => ({
    reminders: [], loading: false, createReminder: vi.fn(), updateReminder: vi.fn(), completeReminder: vi.fn(),
  }),
}));
vi.mock('../utils/notifications', () => ({ initializeNotifications: vi.fn(), addNotificationForReminder: vi.fn() }));
vi.mock('../utils/notificationSync', () => ({
  upsertAlarm: vi.fn(), deleteAlarm: vi.fn(), requestNotificationPermission: vi.fn(),
}));
vi.mock('../offline', () => ({ outbox: {} }));
vi.mock('../offline/useOnlineSync', () => ({ useOnlineSync: () => ({ pending: 0 }) }));

import App from '../App';

function renderApp(hash = '#/') {
  window.location.hash = hash;
  return render(<HashRouter><App /></HashRouter>);
}

describe('App shell', () => {
  beforeEach(() => { mounts.length = 0; });

  it('redirects / to /chat', async () => {
    renderApp('#/');
    expect(await screen.findByRole('button', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
    expect(window.location.hash).toBe('#/chat');
  });

  it('navigates to Diary via the nav', async () => {
    renderApp('#/chat');
    await userEvent.click(screen.getByRole('button', { name: 'Diary' }));
    expect(window.location.hash).toBe('#/diary');
    expect(screen.getByRole('button', { name: 'Diary' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('scope-diary').parentElement).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('scope-chat').parentElement).toHaveAttribute('hidden');
  });

  it('avatar menu lists Settings/Backup/Restore and Settings navigates', async () => {
    renderApp('#/chat');
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(expect.arrayContaining(['Settings', 'Backup', 'Restore']));
    await userEvent.click(screen.getByRole('menuitem', { name: /settings/i }));
    expect(window.location.hash).toBe('#/settings');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    expect(screen.getByLabelText('Settings page')).toBeInTheDocument();
  });

  it('theme toggle applies clio-dark', async () => {
    localStorage.removeItem('clio.theme');
    document.documentElement.dataset.theme = 'clio-light';
    renderApp('#/chat');
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /dark mode/i }));
    expect(document.documentElement.dataset.theme).toBe('clio-dark');
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menuitem', { name: /light mode/i })).toBeInTheDocument();
  });

  it('Escape closes the menu', async () => {
    renderApp('#/chat');
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps every scope mounted once across tab switches', async () => {
    renderApp('#/chat');
    await userEvent.click(screen.getByRole('button', { name: 'Diary' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect([...mounts].sort()).toEqual(['chat', 'diary', 'notes', 'reminders']);
  });

  it('redirects unknown paths to chat', async () => {
    renderApp('#/nope');
    expect(await screen.findByRole('button', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
    expect(window.location.hash).toBe('#/chat');
  });

  it('search button goes to notes search', async () => {
    renderApp('#/chat');
    await userEvent.click(screen.getByRole('button', { name: 'Search notes' }));
    expect(window.location.hash).toBe('#/notes?focus=search');
  });

  it('Escape returns focus to the account button', async () => {
    renderApp('#/chat');
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('shows the install modal ~2s after beforeinstallprompt', async () => {
    vi.useFakeTimers();
    try {
      renderApp('#/chat');
      const ev = new Event('beforeinstallprompt', { cancelable: true });
      act(() => { window.dispatchEvent(ev); });
      expect(screen.queryByText('Install Clio')).toBeNull();
      act(() => { vi.advanceTimersByTime(2100); });
      expect(screen.getByText('Install Clio')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
