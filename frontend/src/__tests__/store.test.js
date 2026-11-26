import remindersDB, { archiveAllJournalEntries, getAllJournalEntries, createJournalEntry, updateJournalEntry } from '../utils/store';

const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig()), apiFetch: (...a) => apiFetch(...a) }));

const apiReminder = { id: 'r1', title: 'Dentist', due: '2026-12-01T09:00:00.000Z', priority: 'high', repeat: 'never', done: false, notes: 'bring card', createdAt: '2026-11-01T00:00:00.000Z', extras: { checklist: [{ t: 'a' }] } };
beforeEach(() => apiFetch.mockReset());

describe('reminders over the API', () => {
  it('maps API reminders to the shape the UI already uses', async () => {
    apiFetch.mockResolvedValue([{ ...apiReminder, done: true, completedAt: '2026-11-02T00:00:00.000Z', snoozedUntil: '2026-11-03T00:00:00.000Z' }]);
    const [r] = await remindersDB.getAllReminders();
    expect(apiFetch).toHaveBeenCalledWith('/api/reminders');
    expect(r).toMatchObject({
      id: 'r1', title: 'Dentist', description: 'bring card', dueDate: '2026-12-01T09:00:00.000Z', priority: 'high', repeat: 'never',
      completed: true, completed_at: '2026-11-02T00:00:00.000Z', created_at: '2026-11-01T00:00:00.000Z', snoozedUntil: '2026-11-03T00:00:00.000Z',
      checklist: [{ t: 'a' }],
    });
  });
  it('create sends mapped fields and keeps unknown UI fields in extras', async () => {
    apiFetch.mockResolvedValue(apiReminder);
    await remindersDB.createReminder({ title: 'Dentist', description: 'bring card', dueDate: '2026-12-01T09:00', priority: 'high', repeat: 'never', checklist: [{ t: 'a' }], contact: 'Ana' });
    const [path, init] = apiFetch.mock.calls[0];
    expect([path, init.method]).toEqual(['/api/reminders', 'POST']);
    expect(init.json).toMatchObject({ title: 'Dentist', notes: 'bring card', priority: 'high', repeat: 'never', extras: { checklist: [{ t: 'a' }], contact: 'Ana' } });
    expect(init.json.due).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(init.json).not.toHaveProperty('dueDate');
  });
  it('update sends a PUT with done/snooze mapped', async () => {
    apiFetch.mockResolvedValue({ ...apiReminder, done: true });
    const saved = await remindersDB.updateReminder({ id: 'r1', title: 'Dentist', description: '', dueDate: '2026-12-01T09:00:00.000Z', priority: 'low', repeat: 'daily', completed: true, snoozedUntil: null });
    const [path, init] = apiFetch.mock.calls[0];
    expect([path, init.method]).toEqual(['/api/reminders/r1', 'PUT']);
    expect(init.json).toMatchObject({ title: 'Dentist', priority: 'low', repeat: 'daily', done: true, snoozedUntil: null, notes: '' });
    expect(saved.completed).toBe(true);
  });
  it('update preserves edited checklist completion in reminder extras', async () => {
    apiFetch.mockResolvedValue({
      ...apiReminder,
      extras: { checklist: [{ text: 'First item', done: true }, { text: 'Second item', done: false }] },
    });
    await remindersDB.updateReminder({
      id: 'r1',
      title: 'Dentist',
      description: 'bring card',
      dueDate: '2026-12-01T09:00:00.000Z',
      priority: 'high',
      repeat: 'never',
      checklist: [{ text: 'First item', done: true }, { text: 'Second item', done: false }],
    });
    expect(apiFetch.mock.calls[0][1].json.extras).toMatchObject({
      checklist: [{ text: 'First item', done: true }, { text: 'Second item', done: false }],
    });
  });
  it('toggleComplete completes an open reminder through the server (repeat logic) and reopens a done one', async () => {
    apiFetch.mockResolvedValueOnce([apiReminder]).mockResolvedValueOnce({ ...apiReminder, done: true });
    expect((await remindersDB.toggleComplete('r1')).completed).toBe(true);
    expect(apiFetch.mock.calls[1]).toEqual(['/api/reminders/r1/complete', { method: 'POST' }]);
    apiFetch.mockReset();
    apiFetch.mockResolvedValueOnce([{ ...apiReminder, done: true }]).mockResolvedValueOnce({ ...apiReminder, done: false });
    expect((await remindersDB.toggleComplete('r1')).completed).toBe(false);
    expect(apiFetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', json: { done: false } });
  });
  it('toggleComplete rejects for an unknown id', async () => {
    apiFetch.mockResolvedValueOnce([]);
    await expect(remindersDB.toggleComplete('nope')).rejects.toThrow(/not found/i);
  });
  it('cannot delete: archiveAll archives every active reminder instead', async () => {
    expect(remindersDB.deleteReminder).toBeUndefined();
    expect(remindersDB.deleteAllReminders).toBeUndefined();
    apiFetch.mockResolvedValueOnce([apiReminder, { ...apiReminder, id: 'r2' }]).mockResolvedValue(undefined);
    await remindersDB.archiveAllReminders();
    expect(apiFetch.mock.calls).toEqual([
      ['/api/reminders'],
      ['/api/reminders/r1/archive', { method: 'POST' }],
      ['/api/reminders/r2/archive', { method: 'POST' }],
    ]);
  });
});

describe('journal over the API', () => {
  const apiEntry = { id: 'j1', text: 'Hello', mood: '😊', createdAt: '2026-11-20T08:00:00.000Z', extras: { tags: ['a'] } };
  it('lists entries in the UI shape (extras spread)', async () => {
    apiFetch.mockResolvedValue([apiEntry]);
    expect(await getAllJournalEntries()).toEqual([{ id: 'j1', text: 'Hello', mood: '😊', createdAt: '2026-11-20T08:00:00.000Z', tags: ['a'] }]);
  });
  it('creates with a string id and unknown fields in extras', async () => {
    apiFetch.mockResolvedValue(apiEntry);
    await createJournalEntry({ id: 123, text: 'Hello', mood: '😊', createdAt: new Date('2026-11-20T08:00:00Z'), tags: ['a'] });
    expect(apiFetch).toHaveBeenCalledWith('/api/journal', { method: 'POST', json: { id: '123', text: 'Hello', mood: '😊', createdAt: '2026-11-20T08:00:00.000Z', extras: { tags: ['a'] } } });
  });
  it('updates by id, and archives (never deletes) all entries', async () => {
    apiFetch.mockResolvedValue(apiEntry);
    await updateJournalEntry('j1', { text: 'Edited' });
    expect(apiFetch).toHaveBeenCalledWith('/api/journal/j1', { method: 'PUT', json: { text: 'Edited' } });
    apiFetch.mockReset();
    apiFetch.mockResolvedValueOnce([apiEntry]).mockResolvedValue(apiEntry);
    await archiveAllJournalEntries();
    expect(apiFetch).toHaveBeenCalledWith('/api/journal/j1/archive', { method: 'POST' });
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });
});

describe('data-change bus', () => {
  const kinds = [];
  const onChange = (e) => kinds.push(e.detail);
  beforeEach(() => { kinds.length = 0; window.addEventListener('clio:data-changed', onChange); });
  afterEach(() => window.removeEventListener('clio:data-changed', onChange));

  it("every successful reminder write emits 'reminders'", async () => {
    apiFetch.mockResolvedValue(apiReminder);
    await remindersDB.createReminder({ title: 'Dentist', dueDate: '2026-12-01T09:00' });
    await remindersDB.updateReminder({ id: 'r1', title: 'Dentist', dueDate: '2026-12-01T09:00' });
    apiFetch.mockResolvedValueOnce([apiReminder]).mockResolvedValueOnce({ ...apiReminder, done: true });
    await remindersDB.toggleComplete('r1');
    expect(kinds).toEqual(['reminders', 'reminders', 'reminders']);
  });
  it('does not emit when the write fails', async () => {
    const boom = async () => { throw new Error('boom'); };
    apiFetch.mockImplementationOnce(boom).mockImplementationOnce(boom);
    let failures = 0;
    try { await remindersDB.createReminder({ title: 'x', dueDate: '2026-12-01T09:00' }); } catch (e) { failures += e.message === 'boom' ? 1 : 0; }
    try { await createJournalEntry({ text: 'x' }); } catch (e) { failures += e.message === 'boom' ? 1 : 0; }
    expect(failures).toBe(2);
    expect(kinds).toEqual([]);
  });
  it("journal writes emit 'daily'", async () => {
    apiFetch.mockResolvedValue({ id: 'j1', text: 'Hi', createdAt: '2026-11-20T08:00:00.000Z' });
    await createJournalEntry({ text: 'Hi' });
    await updateJournalEntry('j1', { text: 'Hey' });
    expect(kinds).toEqual(['daily', 'daily']);
  });
});
