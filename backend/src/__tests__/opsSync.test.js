import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeApi } from './helpers/api.js';
import { createOpsSyncService } from '../services/opsSyncService.js';

const T = 1_700_000_000_000;
const due = '2030-01-01T09:00:00.000Z';

async function apiWithOps() {
  const opsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-ops-'));
  const holder = {};
  const api = await makeApi({ opsSync: { apply: (ops) => holder.svc.apply(ops) } });
  holder.svc = createOpsSyncService({ reminders: api.deps.reminders, daily: api.deps.daily, dataDir: opsDir });
  return { ...api, svc: holder.svc, opsDir };
}

const createOp = (over = {}) => ({ id: 'op1', createdAt: T, kind: 'reminder.create', data: { id: 'offline00001', title: 'Water plants', due }, ...over });

describe('POST /api/sync/ops', () => {
  it('requires a token', async () => {
    const { app } = await apiWithOps();
    const request = (await import('supertest')).default;
    expect((await request(app).post('/api/sync/ops').send({ ops: [] })).status).toBe(401);
  });

  it('creates a reminder with the client id, then applies later ops that refer to it', async () => {
    const { as } = await apiWithOps();
    const res = await as('post', '/api/sync/ops').send({
      ops: [
        createOp(),
        { id: 'op2', createdAt: T + 1, kind: 'reminder.update', reminderId: 'offline00001', patch: { priority: 'high' } },
        { id: 'op3', createdAt: T + 2, kind: 'reminder.snooze', reminderId: 'offline00001', until: '2030-01-01T10:00:00.000Z' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
    const list = (await as('get', '/api/reminders')).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'offline00001', title: 'Water plants', priority: 'high', snoozedUntil: '2030-01-01T10:00:00.000Z' });
  });

  it('applies ops in createdAt order, not array order', async () => {
    const { as } = await apiWithOps();
    const res = await as('post', '/api/sync/ops').send({
      ops: [
        { id: 'op2', createdAt: T + 5, kind: 'reminder.complete', reminderId: 'offline00001' },
        createOp(),
      ],
    });
    expect(res.body.results.map((r) => [r.id, r.status])).toEqual([['op1', 'applied'], ['op2', 'applied']]);
    expect((await as('get', '/api/reminders')).body[0].done).toBe(true);
  });

  it('resending the same op id is a duplicate and changes nothing', async () => {
    const { as } = await apiWithOps();
    await as('post', '/api/sync/ops').send({ ops: [createOp()] });
    const again = await as('post', '/api/sync/ops').send({ ops: [createOp()] });
    expect(again.body.results[0].status).toBe('duplicate');
    expect((await as('get', '/api/reminders')).body).toHaveLength(1);
  });

  it('a create whose reminder already exists (new op id) is a duplicate', async () => {
    const { as } = await apiWithOps();
    await as('post', '/api/reminders').send({ id: 'offline00001', title: 'Water plants', due });
    const res = await as('post', '/api/sync/ops').send({ ops: [createOp({ id: 'other' })] });
    expect(res.body.results[0].status).toBe('duplicate');
    expect((await as('get', '/api/reminders')).body).toHaveLength(1);
  });

  it('rejects ops on a reminder that no longer exists without failing the batch', async () => {
    const { as } = await apiWithOps();
    const res = await as('post', '/api/sync/ops').send({
      ops: [
        { id: 'gone', createdAt: T, kind: 'reminder.complete', reminderId: 'doesnotexist1' },
        { id: 'day', createdAt: T + 1, kind: 'daily.append', date: '2026-11-20', entry: { mood: 4 } },
      ],
    });
    expect(res.body.results).toEqual([
      expect.objectContaining({ id: 'gone', status: 'rejected', code: 'not_found' }),
      expect.objectContaining({ id: 'day', status: 'applied' }),
    ]);
  });

  it('appends offline check-ins to the right day, once', async () => {
    const { as } = await apiWithOps();
    const ops = [
      { id: 'm', createdAt: T, kind: 'daily.append', date: '2026-11-20', entry: { mood: 2 } },
      { id: 't', createdAt: T + 1, kind: 'daily.append', date: '2026-11-20', entry: { section: 'thoughts', text: 'Quiet day offline' } },
    ];
    await as('post', '/api/sync/ops').send({ ops });
    await as('post', '/api/sync/ops').send({ ops });
    const day = (await as('get', '/api/daily/2026-11-20')).body;
    expect(day.exists).toBe(true);
    expect(day.frontmatter.mood).toBe(2);
    expect(day.body.match(/Quiet day offline/g)).toHaveLength(1);
  });

  it('validates the batch shape', async () => {
    const { as } = await apiWithOps();
    expect((await as('post', '/api/sync/ops').send({ ops: [{ id: 'x', createdAt: T, kind: 'reminder.nuke' }] })).status).toBe(400);
    expect((await as('post', '/api/sync/ops').send({ ops: [createOp({ data: { title: 'no id', due } })] })).status).toBe(400);
  });

  it('keeps receipts on disk across service instances', async () => {
    const { svc, opsDir, deps } = await apiWithOps();
    await svc.apply([createOp()]);
    const fresh = createOpsSyncService({ reminders: deps.reminders, daily: deps.daily, dataDir: opsDir });
    expect((await fresh.apply([createOp()]))[0].status).toBe('duplicate');
  });
});

describe('POST /api/reminders with a client id', () => {
  it('uses the id, and a second create with it is a 409', async () => {
    const { as } = await apiWithOps();
    const first = await as('post', '/api/reminders').send({ id: 'clientid0001', title: 'A', due });
    expect(first.status).toBe(201);
    expect(first.body.id).toBe('clientid0001');
    expect((await as('post', '/api/reminders').send({ id: 'clientid0001', title: 'A', due })).status).toBe(409);
  });
  it('rejects a malformed id', async () => {
    const { as } = await apiWithOps();
    expect((await as('post', '/api/reminders').send({ id: 'Bad-ID', title: 'A', due })).status).toBe(400);
  });
});

