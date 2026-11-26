import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckinForm } from '../components/gen/CheckinForm';
import { ReminderCards } from '../components/gen/ReminderCards';
import { DiaryReflection } from '../components/gen/DiaryReflection';
import { PeoplePicker } from '../components/media/PeoplePicker';
import { PhotoPicker } from '../components/media/PhotoPicker';
import { overlayDayDetail, overlayDays, overlayNotes } from '../offline/overlay';
import type { Op } from '../offline/opsOutbox';
import type { DaySummary, Reminder } from '../lib/types';

// Stored photos are fetched through apiFetch; keep them pending in these tests.
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: () => new Promise(() => {}) }));

const g = globalThis as unknown as { URL: { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void } };
beforeAll(() => {
  g.URL.createObjectURL ??= () => 'blob:preview';
  g.URL.revokeObjectURL ??= () => {};
});
afterEach(() => {
  delete (navigator as unknown as { contacts?: unknown }).contacts;
});

describe('PeoplePicker', () => {
  it('without the Contact Picker API, explains why and lets you type a person', async () => {
    const onChange = vi.fn();
    render(<PeoplePicker value={[]} onChange={onChange} />);
    expect(screen.getByText(/only chrome on android/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /from contacts/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /add person/i }));
    await userEvent.type(screen.getByLabelText('Name'), 'Ana Cruz');
    await userEvent.type(screen.getByLabelText('Phone'), '0917');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith([{ name: 'Ana Cruz', phone: '0917' }]);
  });

  it('picks from the device address book where the browser allows it', async () => {
    const select = vi.fn(async () => [{ name: ['Ben'], tel: ['+1 555'], email: [] }, { name: [], tel: ['+2 666'] }]);
    (navigator as unknown as { contacts: unknown }).contacts = { select };
    const onChange = vi.fn();
    render(<PeoplePicker value={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /from contacts/i }));
    expect(select).toHaveBeenCalledWith(['name', 'tel', 'email'], { multiple: true });
    expect(onChange).toHaveBeenCalledWith([{ name: 'Ben', phone: '+1 555' }, { name: '+2 666', phone: '+2 666' }]);
  });

  it('single mode keeps one person and hides the add buttons once chosen', () => {
    render(<PeoplePicker single value={[{ name: 'Ana' }]} onChange={() => {}} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add person/i })).toBeNull();
  });
});

describe('PhotoPicker', () => {
  it('adds picked photos (encoded for upload) and removes them', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PhotoPicker value={[]} onChange={onChange} />);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'me.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Add photos'), file);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [items] = onChange.mock.calls[0];
    expect(items).toHaveLength(1);
    expect(items[0].file).toMatch(/^[a-z0-9]{8,40}\.jpg$/);
    expect(items[0].prepared).toMatchObject({ mime: 'image/jpeg', data: '/9j/4AECAw==' });
    rerender(<PhotoPicker value={items} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('refuses files that are not photos', async () => {
    const onChange = vi.fn();
    render(<PhotoPicker value={[]} onChange={onChange} />);
    await userEvent.upload(screen.getByLabelText('Add photos'), new File(['x'], 'a.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a photo/i);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CheckinForm editing', () => {
  it('starts from the logged day and submits the changes', async () => {
    const onSubmit = vi.fn();
    render(
      <CheckinForm
        initial={{ mood: 3, events: 'Lunch\nWalk', thoughts: '', ideas: '', photos: [], people: [{ name: 'Ana' }], places: [{ lat: 1, lng: 2, label: 'Park' }] }}
        onSubmit={onSubmit}
        onSkip={() => {}}
        submitLabel="Save changes"
        skipLabel="Cancel"
      />,
    );
    expect(screen.getByRole('radio', { name: 'Mood 3' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(/what happened/i)).toHaveValue('Lunch\nWalk');
    expect(screen.getByText('Park')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mood: 3, events: 'Lunch\nWalk', people: [], places: [{ lat: 1, lng: 2, label: 'Park' }] }));
  });
});

describe('cards', () => {
  it('a reminder card shows its contact, place and photo count', () => {
    const r: Reminder = { id: 'a', title: 'Call', due: '2030-01-01T09:00:00Z', priority: 'medium', repeat: 'never', done: false, notes: '', extras: { contact: { name: 'Ana' }, location: { lat: 1, lng: 2, label: 'Office' }, photos: ['abcdefgh12.jpg', {}] } };
    render(<ReminderCards reminders={[r]} onComplete={() => {}} onSnooze={() => {}} />);
    const card = screen.getByRole('listitem');
    expect(within(card).getByText('Ana')).toBeInTheDocument();
    expect(within(card).getByText('Office').closest('a')).toHaveAttribute('href', expect.stringContaining('mlat=1'));
    expect(within(card).getByText('1')).toBeInTheDocument();
  });

  it('a journal day card shows people and places, and opens for editing', async () => {
    const onEdit = vi.fn();
    const day: DaySummary = { date: '2026-11-20', mood: 4, energy: null, headline: 'Beach', hasEntry: true, sections: { thoughts: 0, ideas: 0, events: 1 }, people: ['Ana'], places: [{ lat: 1, lng: 2, label: 'Shore' }], photos: [] };
    render(<DiaryReflection day={day} onEdit={onEdit} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Shore')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit 2026-11-20' }));
    expect(onEdit).toHaveBeenCalled();
  });
});

describe('offline overlays for edits', () => {
  const T = 1_700_000_000_000;
  const edit: Op = { id: 'e', createdAt: T, kind: 'daily.replace', date: '2026-11-20', day: { baseHash: 'h', mood: 2, events: ['Edited'], thoughts: [], ideas: [], photos: ['abcdefgh12.jpg'], people: [{ name: 'Bo' }], places: [] } };

  it('a queued day edit shows in the week and in the day', () => {
    const d: DaySummary = { date: '2026-11-20', mood: 5, energy: null, headline: 'Old', hasEntry: true, sections: { thoughts: 3, ideas: 0, events: 1 } };
    expect(overlayDays([d], [edit])[0]).toMatchObject({ mood: 2, headline: 'Edited', sections: { thoughts: 0, events: 1 }, people: ['Bo'], photos: ['abcdefgh12.jpg'] });
    const detail = overlayDayDetail({ date: '2026-11-20', exists: true, hash: 'h', frontmatter: { mood: 5 }, entries: { events: ['Old'], thoughts: [], ideas: [], photos: [], people: [], places: [] } }, [
      edit,
      { id: 'a', createdAt: T + 1, kind: 'daily.append', date: '2026-11-20', entry: { section: 'ideas', text: 'Later idea' } },
    ]);
    expect(detail.frontmatter).toEqual({ mood: 2 });
    expect(detail.entries).toMatchObject({ events: ['Edited'], ideas: ['Later idea'], people: [{ name: 'Bo' }] });
    expect(detail.hash).toBe('h');
  });

  it('a queued note edit shows in the list', () => {
    const out = overlayNotes(
      [{ path: 'Clio/Notes/a.md', title: 'Old', tags: [], snippet: 'old', updated: '', hash: 'h', checklist: [] }],
      [{ id: 'x', path: 'Clio/Notes/a.md', title: 'New', body: 'fresh text\n\n![photo](../Attachments/abcdefgh12.png)', baseHash: 'h', createdAt: T }],
    );
    expect(out).toEqual([expect.objectContaining({ title: 'New', snippet: 'fresh text', photos: ['abcdefgh12.png'] })]);
  });
});
