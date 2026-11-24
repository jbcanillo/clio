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

  const cl = (m: boolean, e: boolean) => [{ index: 0, text: 'Milk', done: m }, { index: 1, text: 'Eggs', done: e }];
  const state = (n: string) => screen.getByRole('checkbox', { name: n }).getAttribute('aria-checked');

  it('hash-only rerender after a successful toggle keeps the row toggled', async () => {
    const { rerender } = render(<ChecklistNote note={note()} onToggle={async () => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eggs' }));
    rerender(<ChecklistNote note={note({ hash: 'h2' })} onToggle={async () => {}} />);
    expect(state('Eggs')).toBe('true');
  });
  it('changed checklist from parent shows the prop value', async () => {
    const { rerender } = render(<ChecklistNote note={note()} onToggle={async () => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eggs' }));
    rerender(<ChecklistNote note={note({ hash: 'h2', checklist: cl(true, true) })} onToggle={async () => {}} />);
    await waitFor(() => expect(state('Eggs')).toBe('true'));
    // override cleared: a later prop flip to false is honoured
    rerender(<ChecklistNote note={note({ hash: 'h3', checklist: cl(true, false) })} onToggle={async () => {}} />);
    await waitFor(() => expect(state('Eggs')).toBe('false'));
  });
  it('after a 409, a refetched different checklist shows the new server value', async () => {
    const f = () => Promise.reject(new ApiError(409, 'conflict'));
    const { rerender } = render(<ChecklistNote note={note()} onToggle={f} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eggs' }));
    await screen.findByRole('status');
    rerender(<ChecklistNote note={note({ hash: 'h2', checklist: cl(false, true) })} onToggle={f} />);
    await waitFor(() => expect(state('Eggs')).toBe('true'));
    expect(state('Milk')).toBe('false');
  });
  it('two rows toggled concurrently both settle', async () => {
    const resolvers: Array<() => void> = [];
    const onToggle = vi.fn(() => new Promise<void>((res) => { resolvers.push(res); }));
    render(<ChecklistNote note={note()} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Eggs' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Milk' }));
    expect(onToggle).toHaveBeenCalledTimes(2);
    resolvers.forEach((r) => r());
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Eggs' })).not.toHaveAttribute('aria-disabled'));
    expect(state('Eggs')).toBe('true');
    expect(state('Milk')).toBe('false');
  });
});
