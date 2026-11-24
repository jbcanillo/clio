import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotesPage from '../pages/NotesPage';
import { ApiError } from '../lib/api';
import { DATA_CHANGED_EVENT } from '../lib/dataEvents';
import type { NoteSummary } from '../lib/types';

const listNotes = vi.fn();
const toggleChecklist = vi.fn();
vi.mock('../lib/clioApi', async (orig) => ({
  ...(await orig<object>()),
  listNotes: (...a: unknown[]) => listNotes(...a),
  toggleChecklist: (...a: unknown[]) => toggleChecklist(...a),
}));
const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));
const saveNote = vi.fn();
vi.mock('../offline', () => ({ saveNote: (...a: unknown[]) => saveNote(...a) }));
let chatProps: { scope: string; mode: string; placeholder: string; chips: { label: string }[]; pendingPrompt?: { id: string; text: string } } | null = null;
vi.mock('../components/chat/ClioChat', () => ({
  ClioChat: (p: NonNullable<typeof chatProps>) => { chatProps = p; return <div data-testid="chat" />; },
}));
let actionProps: { scope: string; timezone: string; shareOn?: boolean } | null = null;
vi.mock('../copilot/actions', async (orig) => ({
  ...(await orig<object>()),
  ClioActions: (p: NonNullable<typeof actionProps>) => { actionProps = p; return null; },
}));

const note = (o: Partial<NoteSummary> & { path: string }): NoteSummary => ({
  title: 'T', tags: [], snippet: '', updated: '2026-11-20', hash: 'h0', checklist: [], ...o,
});
const A = note({
  path: 'Clio/Notes/a.md', title: 'Groceries', tags: ['home'], hash: 'ha',
  checklist: [{ index: 0, text: 'Buy oat milk', done: false }, { index: 1, text: 'Buy eggs', done: false }],
});
const B = note({ path: 'Clio/Notes/b.md', title: 'Work plan', tags: ['work'], snippet: 'Quarterly goals', hash: 'hb' });
const C = note({ path: 'Clio/Notes/c.md', title: 'Home repairs', tags: ['home', 'work'], hash: 'hc' });

const renderPage = (url = '/notes') => render(<MemoryRouter initialEntries={[url]}><NotesPage /></MemoryRouter>);

beforeEach(() => {
  listNotes.mockReset().mockResolvedValue([A, B, C]);
  toggleChecklist.mockReset().mockResolvedValue({ hash: 'h1' });
  saveNote.mockReset().mockResolvedValue(undefined);
  apiFetch.mockReset().mockImplementation(async (p: string) => {
    if (p === '/api/settings') return { timezone: 'America/Los_Angeles' };
    if (p === '/api/session/share') return { on: true };
    throw new Error('unexpected ' + p);
  });
  chatProps = null;
  actionProps = null;
});

describe('NotesPage', () => {
  it('renders note cards and tag chips with counts', async () => {
    renderPage();
    expect(await screen.findByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Work plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'home 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'work 2' })).toBeInTheDocument();
    expect(chatProps).toMatchObject({ scope: 'notes', mode: 'sheet', placeholder: 'Ask about your notes…' });
    expect(chatProps?.chips.map((c) => c.label)).toEqual(['Summarize my notes', 'Turn a note into tasks']);
  });

  it('typing filters by title, snippet and checklist text', async () => {
    renderPage();
    await screen.findByText('Groceries');
    const box = screen.getByRole('textbox', { name: 'Search notes' });
    await userEvent.type(box, 'QUARTERLY');
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
    expect(screen.getByText('Work plan')).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'oat milk');
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByText('Work plan')).not.toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    expect(screen.getByText('No matching notes.')).toBeInTheDocument();
  });

  it('tag chip filters and combines with search', async () => {
    renderPage();
    await screen.findByText('Groceries');
    await userEvent.click(screen.getByRole('button', { name: 'work 2' }));
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
    expect(screen.getByText('Work plan')).toBeInTheDocument();
    expect(screen.getByText('Home repairs')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search notes' }), 'repairs');
    expect(screen.queryByText('Work plan')).not.toBeInTheDocument();
    expect(screen.getByText('Home repairs')).toBeInTheDocument();
  });

  it('toggles with the stored hash, then uses the NEW hash for the next toggle', async () => {
    renderPage();
    await screen.findByText('Groceries');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Buy oat milk' }));
    await waitFor(() => expect(toggleChecklist).toHaveBeenCalledWith('Clio/Notes/a.md', 0, true, 'ha'));
    toggleChecklist.mockResolvedValue({ hash: 'h2' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Buy eggs' }));
    await waitFor(() => expect(toggleChecklist).toHaveBeenLastCalledWith('Clio/Notes/a.md', 1, true, 'h1'));
  });

  it('a 409 refetches the list and shows the conflict message', async () => {
    toggleChecklist.mockRejectedValue(new ApiError(409, 'stale'));
    renderPage();
    await screen.findByText('Groceries');
    expect(listNotes).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Buy oat milk' }));
    await waitFor(() => expect(listNotes).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/changed elsewhere/)).toBeInTheDocument();
  });

  it('shows the empty vault state with a New note button', async () => {
    listNotes.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New note' })).toBeInTheDocument();
  });

  it('?focus=search focuses the input and clears the param', async () => {
    renderPage('/notes?focus=search');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search notes' })).toHaveFocus());
  });

  it('Ask button sends the query to the notes chat; empty query does nothing', async () => {
    renderPage();
    await screen.findByText('Groceries');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Clio' }));
    expect(chatProps?.pendingPrompt).toBeUndefined();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search notes' }), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Clio' }));
    expect(chatProps?.pendingPrompt).toBeUndefined();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Search notes' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search notes' }), 'eggs');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Clio' }));
    expect(chatProps?.pendingPrompt).toMatchObject({ text: 'eggs' });
    const firstId = chatProps?.pendingPrompt?.id;
    await userEvent.click(screen.getByRole('button', { name: 'Ask Clio' }));
    expect(chatProps?.pendingPrompt?.id).not.toBe(firstId);
  });

  it('Enter asks only when the query matches no note', async () => {
    renderPage();
    await screen.findByText('Groceries');
    const box = screen.getByRole('textbox', { name: 'Search notes' });
    await userEvent.type(box, 'eggs{Enter}');
    expect(chatProps?.pendingPrompt).toBeUndefined();
    await userEvent.clear(box);
    await userEvent.type(box, 'what is due soon?{Enter}');
    expect(chatProps?.pendingPrompt).toMatchObject({ text: 'what is due soon?' });
  });

  it('New note saves and closes the sheet (saveNote / the outbox emit notes, not the page)', async () => {
    renderPage();
    await screen.findByText('Groceries');
    await userEvent.click(screen.getByRole('button', { name: 'New note' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Idea');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Body text');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(saveNote).toHaveBeenCalledWith({ title: 'Idea', body: 'Body text' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the sheet open when saving fails', async () => {
    saveNote.mockRejectedValue(new Error('x'));
    renderPage();
    await screen.findByText('Groceries');
    await userEvent.click(screen.getByRole('button', { name: 'New note' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Idea');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Body');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a failed fetch is retryable and the chat stays present', async () => {
    listNotes.mockRejectedValueOnce(new Error('x'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your notes.");
    expect(screen.getByTestId('chat')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refetches when notes data changes', async () => {
    renderPage();
    await screen.findByText('Groceries');
    act(() => { window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: 'notes' })); });
    await waitFor(() => expect(listNotes).toHaveBeenCalledTimes(2));
  });

  it('passes scope, shareOn and timezone to ClioActions', async () => {
    renderPage();
    await waitFor(() => expect(actionProps).toMatchObject({ scope: 'notes', shareOn: true, timezone: 'America/Los_Angeles' }));
  });

  it('falls back to UTC for an invalid timezone and to share off on failure', async () => {
    apiFetch.mockImplementation(async (p: string) => {
      if (p === '/api/settings') return { timezone: 'Not/AZone' };
      throw new Error('x');
    });
    renderPage();
    await screen.findByText('Groceries');
    await waitFor(() => expect(actionProps).toMatchObject({ scope: 'notes', shareOn: false, timezone: 'UTC' }));
  });
});
