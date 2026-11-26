import { ApiError } from '../lib/api';
import { loadDay, saveCheckin, updateCheckin } from '../lib/journal';

const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));
const savePhoto = vi.fn();
vi.mock('../lib/media', async (orig) => {
  const real = await orig<typeof import('../lib/media')>();
  return {
    ...real,
    savePhotoItems: async (items: { file: string; prepared?: unknown }[]) => {
      for (const it of items) if (it.prepared) savePhoto(it.file);
      return items.map((it) => it.file);
    },
  };
});

const base = { mood: 4 as const, events: '', thoughts: '', ideas: '', photos: [], people: [], places: [] };
beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({});
  savePhoto.mockReset();
});

describe('saveCheckin', () => {
  it('posts each line, the photos (after uploading new ones), people and places', async () => {
    await saveCheckin('2026-11-20', {
      ...base,
      events: 'Lunch\n\n Walk ',
      photos: [{ file: 'abcdefgh12.jpg', prepared: { file: 'abcdefgh12.jpg', mime: 'image/jpeg', data: 'x', url: 'blob:' } }],
      people: [{ name: 'Ana' }],
      places: [{ lat: 1, lng: 2 }],
    });
    expect(savePhoto).toHaveBeenCalledWith('abcdefgh12.jpg');
    expect(apiFetch.mock.calls.map(([, i]) => i.json)).toEqual([
      { mood: 4 },
      { section: 'events', text: 'Lunch' },
      { section: 'events', text: 'Walk' },
      { photo: 'abcdefgh12.jpg' },
      { person: { name: 'Ana' } },
      { place: { lat: 1, lng: 2 } },
    ]);
  });
});

describe('loadDay / updateCheckin', () => {
  it('turns a logged day into form values and remembers its version', async () => {
    apiFetch.mockResolvedValueOnce({
      date: '2026-11-20', exists: true, hash: 'h1', frontmatter: { mood: 3 },
      entries: { events: ['A', 'B'], thoughts: ['T'], ideas: [], photos: ['abcdefgh12.jpg'], people: [{ name: 'Ana' }], places: [] },
    });
    const { values, baseHash } = await loadDay('2026-11-20');
    expect(baseHash).toBe('h1');
    expect(values).toEqual({ mood: 3, events: 'A\nB', thoughts: 'T', ideas: '', photos: [{ file: 'abcdefgh12.jpg' }], people: [{ name: 'Ana' }], places: [] });
  });

  it('a day with no note yet starts empty, from no version', async () => {
    apiFetch.mockResolvedValueOnce({ date: '2026-11-21', exists: false });
    expect((await loadDay('2026-11-21')).baseHash).toBeNull();
  });

  it('PUTs the whole day with one entry per line', async () => {
    await updateCheckin('2026-11-20', { ...base, mood: 2, events: 'One\nTwo', people: [{ name: 'Bo' }] }, 'h1');
    expect(apiFetch).toHaveBeenCalledWith('/api/daily/2026-11-20', {
      method: 'PUT',
      json: { baseHash: 'h1', mood: 2, events: ['One', 'Two'], thoughts: [], ideas: [], photos: [], people: [{ name: 'Bo' }], places: [] },
    });
  });

  it('explains a conflict', async () => {
    apiFetch.mockRejectedValueOnce(new ApiError(409, 'conflict'));
    await expect(updateCheckin('2026-11-20', base, 'old')).rejects.toThrow(/changed somewhere else/i);
  });
});
