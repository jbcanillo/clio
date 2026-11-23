import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChecklistNote } from '../../components/gen/ChecklistNote';
import { ApiError } from '../../lib/api';
import type { NoteSummary } from '../../lib/types';

const note = (over: Partial<NoteSummary> = {}): NoteSummary => ({
  path: 'n.md', title: 'Groceries', tags: ['home'], snippet: 'Weekend list', updated: '2026-11-01', hash: 'h',
  checklist: [
    { index: 0, text: 'Milk', done: true },
    { index: 1, text: 'Eggs', done: false },
  ],
  ...over,
});

describe('ChecklistNote', () => {
  it('shows title, tags, snippet, progress', () => {
    render(<ChecklistNote note={note()} onToggle={async () => {}} />);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('#home')).toBeInTheDocument();
    expect(screen.getByText('Weekend list')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open in notes/i })).toBeNull();
  });
  it('toggling row 2 calls onToggle(1, true) optimistically', async () => {
    const onToggle = vi.fn(() => new Promise<void>(() => {}));
    render(<ChecklistNote note={note()} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eggs' }));
    expect(onToggle).toHaveBeenCalledWith(1, true);
    expect(screen.getByRole('checkbox', { name: 'Eggs' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eggs' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
  it('409 reverts, shows status, calls onConflict', async () => {
    const onConflict = vi.fn();
    render(<ChecklistNote note={note()} onToggle={() => Promise.reject(new ApiError(409, 'conflict'))} onConflict={onConflict} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eggs' }));
    expect(await screen.findByRole('status')).toHaveTextContent('This note changed elsewhere — reloaded.');
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Eggs' })).toHaveAttribute('aria-checked', 'false');
  });
  it('other error reverts and alerts', async () => {
    render(<ChecklistNote note={note()} onToggle={() => Promise.reject(new Error('x'))} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Milk' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update that note.");
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'true');
  });
  it('re-syncs when the note prop changes', async () => {
    const { rerender } = render(<ChecklistNote note={note()} onToggle={async () => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eggs' }));
    rerender(<ChecklistNote note={note({ checklist: [{ index: 0, text: 'Milk', done: false }, { index: 1, text: 'Eggs', done: false }] })} onToggle={async () => {}} />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByRole('checkbox', { name: 'Eggs' })).toHaveAttribute('aria-checked', 'false');
  });
  it('no checklist renders no list or progress; open button only with onOpen', async () => {
    const onOpen = vi.fn();
    render(<ChecklistNote note={note({ checklist: [] })} onToggle={async () => {}} onOpen={onOpen} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText(/done$/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /open in notes/i }));
    expect(onOpen).toHaveBeenCalled();
  });
  it('renders hostile text as text', () => {
    const h = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <ChecklistNote note={note({ title: h, snippet: h, tags: [h], checklist: [{ index: 0, text: h, done: false }] })} onToggle={async () => {}} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText(/<img src=x/).length).toBeGreaterThanOrEqual(3);
  });
});
