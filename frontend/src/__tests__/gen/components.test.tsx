import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckinForm } from '../../components/gen/CheckinForm';
import { ConfirmCard } from '../../components/gen/ConfirmCard';
import { MoodChart } from '../../components/gen/MoodChart';
import { NotePreview } from '../../components/gen/NotePreview';
import { ReminderCards } from '../../components/gen/ReminderCards';
import { SearchResults } from '../../components/gen/SearchResults';

describe('CheckinForm', () => {
  it('disables submit until a mood is chosen', () => {
    render(<CheckinForm onSubmit={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole('button', { name: /save check-in/i })).toBeDisabled();
  });
  it('submits mood and the three text fields', async () => {
    const onSubmit = vi.fn();
    render(<CheckinForm onSubmit={onSubmit} onSkip={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Mood 4' }));
    await userEvent.type(screen.getByLabelText(/what happened/i), 'Dentist at 9');
    await userEvent.click(screen.getByRole('button', { name: /save check-in/i }));
    expect(onSubmit).toHaveBeenCalledWith({ mood: 4, events: 'Dentist at 9', thoughts: '', ideas: '', photos: [], people: [], places: [] });
  });
  it('calls onSkip', async () => {
    const onSkip = vi.fn();
    render(<CheckinForm onSubmit={() => {}} onSkip={onSkip} />);
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmCard', () => {
  it('calls onApprove and onCancel once each', async () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmCard title="Delete reminder?" detail="Dentist" onApprove={onApprove} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('MoodChart', () => {
  it('shows an empty state instead of throwing when there is no data', () => {
    render(<MoodChart series={[]} />);
    expect(screen.getByText(/no mood entries yet/i)).toBeInTheDocument();
  });
  it('shows the empty state when every day is null', () => {
    render(<MoodChart series={[{ date: '2026-11-01', mood: null }]} />);
    expect(screen.getByText(/no mood entries yet/i)).toBeInTheDocument();
  });
});

describe('NotePreview', () => {
  it('renders the body as plain text (no HTML injection)', () => {
    const { container } = render(<NotePreview title="T" body={'<img src=x onerror=alert(1)>'} onSave={() => {}} onEdit={() => {}} onDiscard={() => {}} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });
  it('wires Save, Edit and Discard', async () => {
    const fns = { onSave: vi.fn(), onEdit: vi.fn(), onDiscard: vi.fn() };
    render(<NotePreview title="T" body="b" {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    await userEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect([fns.onSave, fns.onEdit, fns.onDiscard].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe('ReminderCards', () => {
  const r = { id: 'a1', title: 'Dentist', due: '2026-12-01T09:00:00.000Z', priority: 'high' as const, repeat: 'never' as const, done: false, notes: '' };
  it('says so when there is nothing coming up', () => {
    render(<ReminderCards reminders={[]} onComplete={() => {}} onSnooze={() => {}} />);
    expect(screen.getByText(/nothing coming up/i)).toBeInTheDocument();
  });
  it('completes and snoozes a reminder by id', async () => {
    const onComplete = vi.fn();
    const onSnooze = vi.fn();
    render(<ReminderCards reminders={[r]} onComplete={onComplete} onSnooze={onSnooze} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /complete dentist/i }));
    await userEvent.click(screen.getByRole('button', { name: /snooze dentist/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: '+1h' }));
    expect(onComplete).toHaveBeenCalledWith('a1');
    expect(onSnooze).toHaveBeenCalledWith('a1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });
});

describe('SearchResults', () => {
  it('shows hits and an empty message', () => {
    const { rerender } = render(<SearchResults hits={[{ path: 'Clio/Notes/a.md', title: 'Garden', snippet: 'tomatoes', score: 1, private: false }]} />);
    expect(screen.getByText('Garden')).toBeInTheDocument();
    rerender(<SearchResults hits={[]} />);
    expect(screen.getByText(/no matching notes/i)).toBeInTheDocument();
  });
});
