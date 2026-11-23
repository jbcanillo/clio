import request from 'supertest';
import { makeVault } from './helpers/vault.js';
import { makeApi } from './helpers/api.js';
import { createReminderService } from '../services/reminderService.js';
import { createJournalService } from '../services/journalService.js';
import { createImportService } from '../services/importService.js';

function setup() {
  const h = makeVault();
  const now = () => new Date('2026-11-23T10:00:00Z');
  const reminders = createReminderService({ vault: h.vault, now });
  const journal = createJournalService({ vault: h.vault, now });
  return { h, reminders, journal, svc: createImportService({ reminders, journal, now }) };
}
const legacyReminder = (over = {}) => ({ id: 1700000000001, title: 'Dentist', description: 'bring card', dueDate: '2026-12-01T09:00:00.000Z', priority: 'high', repeat: 'weekly', completed: false, created_at: '2026-11-01T08:00:00.000Z', checklist: [{ t: 'a' }], ...over });
const legacyJournal = (over = {}) => ({ id: '1700000000002', text: 'Dear diary', mood: '😊', createdAt: '2026-11-02T20:00:00.000Z', ...over });

describe('importService', () => {
  it('imports reminders and journal entries with their data intact', async () => {
    const { svc, reminders, journal } = setup();
    const res = await svc.importLegacy({ reminders: [legacyReminder(), legacyReminder({ id: 2, title: 'Done thing', completed: true, completed_at: '2026-11-10T00:00:00.000Z' })], journals: [legacyJournal()] });
    expect(res).toEqual({ reminders: 2, journals: 1, skipped: 0, dropped: 0 });
    const list = await reminders.list();
    const d = list.find((r) => r.title === 'Dentist');
    expect(d).toMatchObject({ notes: 'bring card', priority: 'high', repeat: 'weekly', createdAt: '2026-11-01T08:00:00.000Z', done: false });
    expect(d.extras).toMatchObject({ checklist: [{ t: 'a' }], legacyId: '1700000000001' });
    expect(list.find((r) => r.title === 'Done thing')).toMatchObject({ done: true, completedAt: '2026-11-10T00:00:00.000Z' });
    expect(await journal.list()).toEqual([expect.objectContaining({ id: 'legacy-1700000000002', text: 'Dear diary', mood: '😊', createdAt: '2026-11-02T20:00:00.000Z' })]);
  });
  it('importing the same payload twice skips everything the second time', async () => {
    const { svc, reminders } = setup();
    const payload = { reminders: [legacyReminder(), legacyReminder({ id: 2, title: 'B' })], journals: [legacyJournal()] };
    await svc.importLegacy(payload);
    const again = await svc.importLegacy(payload);
    expect(again).toEqual({ reminders: 0, journals: 0, skipped: 3, dropped: 0 });
    expect(await reminders.list()).toHaveLength(2);
  });
  it('fills defaults for a reminder missing priority and repeat', async () => {
    const { svc, reminders } = setup();
    await svc.importLegacy({ reminders: [{ id: 5, title: 'Bare', dueDate: '2026-12-01T09:00:00.000Z' }], journals: [] });
    expect((await reminders.list())[0]).toMatchObject({ priority: 'medium', repeat: 'never', done: false });
  });
  it('skips items it cannot use: no title, bad due date, empty journal text, bad journal date', async () => {
    const { svc } = setup();
    const res = await svc.importLegacy({
      reminders: [{ id: 1, dueDate: '2026-12-01T09:00:00Z' }, { id: 2, title: 'x', dueDate: 'not a date' }],
      journals: [legacyJournal({ text: '  ' }), legacyJournal({ id: 'z', createdAt: 'garbage' })],
    });
    expect(res).toMatchObject({ reminders: 0, journals: 0, skipped: 4 });
  });
  it('drops oversized embedded fields such as photos instead of failing the reminder', async () => {
    const { svc, reminders } = setup();
    const res = await svc.importLegacy({ reminders: [legacyReminder({ photo: 'data:image/png;base64,' + 'A'.repeat(9000) })], journals: [] });
    expect(res).toMatchObject({ reminders: 1, dropped: 1 });
    expect((await reminders.list())[0].extras).not.toHaveProperty('photo');
  });
  it('imports 5,000 reminders', async () => {
    const { svc, reminders } = setup();
    const many = Array.from({ length: 5000 }, (_, i) => legacyReminder({ id: i + 10, title: `R${i}` }));
    expect((await svc.importLegacy({ reminders: many, journals: [] })).reminders).toBe(5000);
    expect(await reminders.list()).toHaveLength(5000);
  }, 120_000);
});

describe('POST /api/import/numdum', () => {
  it('requires auth, rejects a bad body, and imports', async () => {
    const h = makeVault();
    const now = () => new Date('2026-11-23T10:00:00Z');
    const reminders = createReminderService({ vault: h.vault, now });
    const journal = createJournalService({ vault: h.vault, now });
    const { app, as } = await makeApi({ reminders, journal, importer: createImportService({ reminders, journal, now }) });
    expect((await request(app).post('/api/import/numdum').send({})).status).toBe(401);
    expect((await as('post', '/api/import/numdum').send({ reminders: 'nope' })).status).toBe(400);
    const ok = await as('post', '/api/import/numdum').send({ reminders: [legacyReminder()], journals: [legacyJournal()] });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ reminders: 1, journals: 1, skipped: 0, dropped: 0 });
  });
});
