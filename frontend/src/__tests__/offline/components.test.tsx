import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictCard } from '../../components/gen/ConflictCard';
import { QuickNote } from '../../components/QuickNote';

describe('ConflictCard', () => {
  it('shows both versions as plain text and wires the three choices', async () => {
    const fns = { onKeepMine: vi.fn(), onKeepTheirs: vi.fn(), onKeepBoth: vi.fn() };
    const { container } = render(<ConflictCard mine={'phone <b>edit</b>'} theirs="server edit" {...fns} />);
    expect(screen.getByText('server edit')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /keep mine/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep theirs/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep both/i }));
    expect([fns.onKeepMine, fns.onKeepTheirs, fns.onKeepBoth].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe('QuickNote', () => {
  it('saves through onSave (the outbox), not fetch, and clears the form', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<QuickNote onSave={onSave} />);
    await userEvent.type(screen.getByLabelText(/title/i), 'Idea');
    await userEvent.type(screen.getByLabelText(/note/i), 'build a muse');
    await userEvent.click(screen.getByRole('button', { name: /save note/i }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Idea', body: 'build a muse' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe('');
    fetchSpy.mockRestore();
  });
  it('does not save an empty note', async () => {
    const onSave = vi.fn();
    render(<QuickNote onSave={onSave} />);
    expect(screen.getByRole('button', { name: /save note/i })).toBeDisabled();
  });
  it('keeps the text and shows an error if saving fails', async () => {
    render(<QuickNote onSave={async () => { throw new Error('locked'); }} />);
    await userEvent.type(screen.getByLabelText(/note/i), 'keep me');
    await userEvent.type(screen.getByLabelText(/title/i), 'T');
    await userEvent.click(screen.getByRole('button', { name: /save note/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect((screen.getByLabelText(/note/i) as HTMLTextAreaElement).value).toBe('keep me');
  });
});
