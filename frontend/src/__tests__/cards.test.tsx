import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiaryReflection } from '../components/gen/DiaryReflection';
import { ChecklistNote } from '../components/gen/ChecklistNote';
import { ReminderCards } from '../components/gen/ReminderCards';
import { personLabel } from '../components/ui/PersonChip';
import type { DaySummary, NoteSummary, Reminder } from '../lib/types';

// Photos are fetched through apiFetch; keep them pending.
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: () => new Promise(() => {}) }));

const day: DaySummary = {
  date: '2026-11-26', mood: 4, energy: null, headline: 'Good', hasEntry: true,
  sections: { thoughts: 1, ideas: 0, events: 0 },
  people: [{ name: 'taeta', phone: '0917 555 1234', email: 'taeta@example.com' }],
};

describe('personLabel', () => {
  it('joins name, phone and email, and accepts plain names from older data', () => {
    expect(personLabel({ name: 'Ana', phone: '0917', email: 'a@x.ph' })).toBe('Ana · 0917 · a@x.ph');
    expect(personLabel({ name: 'Ana', email: 'a@x.ph' })).toBe('Ana · a@x.ph');
    expect(personLabel('Ben')).toBe('Ben');
  });
});

describe('journal day card', () => {
  it("shows each person's phone and email, not just the name", () => {
    render(<DiaryReflection day={day} />);
    expect(screen.getByText('taeta · 0917 555 1234 · taeta@example.com')).toBeInTheDocument();
  });

  it('can be archived (never deleted), and an archived day offers Unarchive', async () => {
    const onArchive = vi.fn();
    const { rerender } = render(<DiaryReflection day={day} onEdit={() => {}} onArchive={onArchive} />);
    await userEvent.click(screen.getByRole('button', { name: 'Archive 2026-11-26' }));
    expect(onArchive).toHaveBeenCalled();
    rerender(<DiaryReflection day={{ ...day, archived: true }} onArchive={onArchive} />);
    expect(screen.getByRole('button', { name: 'Unarchive 2026-11-26' })).toBeInTheDocument();
  });
});

describe('side borders like the journal card', () => {
  it('reminder cards have an orange (ember) side border; note cards a green one', () => {
    const r: Reminder = { id: 'r1', title: 'Call Jose', due: '2030-01-01T09:00:00Z', priority: 'medium', repeat: 'never', done: false, notes: '' };
    const n: NoteSummary = { path: 'Clio/Notes/a.md', title: 'Groceries', tags: [], snippet: 'eggs', updated: '', hash: 'h', checklist: [] };
    const { container } = render(
      <>
        <ReminderCards reminders={[r]} onComplete={() => {}} onSnooze={() => {}} />
        <ChecklistNote note={n} onToggle={async () => {}} />
      </>,
    );
    expect(container.querySelector('li')?.className).toMatch(/border-l-\[3px\].*border-l-ember/);
    expect(screen.getByText('Groceries').closest('div.rounded-2xl')?.className).toMatch(/border-l-\[3px\].*border-l-success/);
  });

  it('reminder and note cards archive through their own button', async () => {
    const onArchiveReminder = vi.fn();
    const onArchiveNote = vi.fn();
    const r: Reminder = { id: 'r1', title: 'Call Jose', due: '2030-01-01T09:00:00Z', priority: 'medium', repeat: 'never', done: false, notes: '' };
    const n: NoteSummary = { path: 'Clio/Notes/a.md', title: 'Groceries', tags: [], snippet: 'eggs', updated: '', hash: 'h', checklist: [] };
    render(
      <>
        <ReminderCards reminders={[r]} onComplete={() => {}} onSnooze={() => {}} onArchive={onArchiveReminder} />
        <ChecklistNote note={n} onToggle={async () => {}} onArchive={onArchiveNote} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archive Call Jose' }));
    expect(onArchiveReminder).toHaveBeenCalledWith('r1', true);
    await userEvent.click(screen.getByRole('button', { name: 'Archive Groceries' }));
    expect(onArchiveNote).toHaveBeenCalled();
  });
});
