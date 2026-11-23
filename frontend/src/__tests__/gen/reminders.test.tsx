import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReminderCards } from '../../components/gen/ReminderCards';
import { RescheduleSuggestion } from '../../components/gen/RescheduleSuggestion';
import type { Reminder } from '../../lib/types';

const base: Reminder = { id: 'r1', title: 'Dentist', due: '2099-12-01T09:00:00.000Z', priority: 'high', repeat: 'weekly', done: false, notes: '' };

describe('ReminderCards interactive', () => {
  it('checks optimistically and calls onComplete', async () => {
    const onComplete = vi.fn(() => new Promise<void>(() => {}));
    render(<ReminderCards reminders={[base]} onComplete={onComplete} onSnooze={() => {}} />);
    const cb = screen.getByRole('checkbox', { name: 'Complete Dentist' });
    await userEvent.click(cb);
    expect(onComplete).toHaveBeenCalledWith('r1');
    expect(cb).toHaveAttribute('aria-checked', 'true');
  });
  it('reverts and alerts when onComplete rejects', async () => {
    render(<ReminderCards reminders={[base]} onComplete={() => Promise.reject(new Error('x'))} onSnooze={() => {}} />);
    const cb = screen.getByRole('checkbox', { name: 'Complete Dentist' });
    await userEvent.click(cb);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update that reminder.");
    expect(cb).toHaveAttribute('aria-checked', 'false');
  });
  it('snooze menu calls onSnooze with ISO strings', async () => {
    const onSnooze = vi.fn();
    render(<ReminderCards reminders={[base]} onComplete={() => {}} onSnooze={onSnooze} />);
    await userEvent.click(screen.getByRole('button', { name: /snooze dentist/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tomorrow 9:00' }));
    const iso = onSnooze.mock.calls[0][1] as string;
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const d = new Date(iso);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
    expect(d.getTime()).toBeGreaterThan(Date.now());
  });
  it('flags overdue unfinished, not snoozed or done', () => {
    const past = '2000-01-01T09:00:00.000Z';
    render(
      <ReminderCards
        reminders={[
          { ...base, id: 'o', title: 'Over', due: past },
          { ...base, id: 's', title: 'Snz', due: past, snoozedUntil: '2099-01-01T00:00:00.000Z' },
          { ...base, id: 'd', title: 'Done', due: past, done: true },
        ]}
        onComplete={() => {}}
        onSnooze={() => {}}
      />,
    );
    const li = (t: string) => screen.getByText(t).closest('li')!;
    expect(li('Over')).toHaveAttribute('data-overdue', 'true');
    expect(li('Snz')).toHaveAttribute('data-overdue', 'false');
    expect(li('Done')).toHaveAttribute('data-overdue', 'false');
  });
  it('renders hostile titles as text', () => {
    const { container } = render(<ReminderCards reminders={[{ ...base, title: '<img src=x onerror=alert(1)>' }]} onComplete={() => {}} onSnooze={() => {}} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
  it('groups high priority first when grouped', () => {
    render(<ReminderCards grouped reminders={[{ ...base, id: 'l', title: 'Low', priority: 'low' }, base]} onComplete={() => {}} onSnooze={() => {}} />);
    expect(screen.getByText(/high priority/i)).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });
});

describe('ReminderCards prop re-sync', () => {
  it('unchecks a repeating reminder after refetch advances due and done is false', async () => {
    const onComplete = vi.fn(async () => {});
    const { rerender } = render(<ReminderCards reminders={[base]} onComplete={onComplete} onSnooze={() => {}} />);
    const cb = screen.getByRole('checkbox', { name: 'Complete Dentist' });
    await userEvent.click(cb);
    expect(cb).toHaveAttribute('aria-checked', 'true');
    rerender(<ReminderCards reminders={[{ ...base, due: '2099-12-08T09:00:00.000Z', done: false }]} onComplete={onComplete} onSnooze={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Complete Dentist' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('RescheduleSuggestion', () => {
  it('calls Accept and Keep once each', async () => {
    const onAccept = vi.fn();
    const onKeep = vi.fn();
    render(<RescheduleSuggestion message="Move to 3pm" onAccept={onAccept} onKeep={onKeep} />);
    expect(screen.getByText('AI Context Engine')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep original' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(1);
  });
  it('shows an alert and re-enables when onAccept rejects', async () => {
    render(<RescheduleSuggestion message="m" onAccept={() => Promise.reject(new Error('x'))} onKeep={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled());
  });
});
