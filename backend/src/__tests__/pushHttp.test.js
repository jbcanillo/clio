import request from 'supertest';
import { makeApi } from './helpers/api.js';

const valid = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
function deps() {
  const subs = [];
  const snoozed = [];
  return {
    subs, snoozed,
    extra: {
      config: { timezone: 'UTC', vapid: { publicKey: 'PUBKEY', privateKey: 'x', subject: 'mailto:a@b.c' } },
      push: { subscribe: async (s) => { if (!s.keys) throw Object.assign(new Error('bad'), { constructor: { name: 'ValidationError' } }); subs.push(s); }, unsubscribe: async (e) => { subs.push(`-${e}`); } },
      scheduler: { snoozeToday: async () => { snoozed.push(1); } },
    },
  };
}

describe('push HTTP', () => {
  it('requires authentication', async () => {
    const d = deps();
    const { app } = await makeApi(d.extra);
    for (const [m, u] of [['get', '/api/push/vapid-public-key'], ['post', '/api/push/subscribe'], ['post', '/api/push/unsubscribe'], ['post', '/api/checkin/snooze']]) {
      expect((await request(app)[m](u)).status, u).toBe(401);
    }
  });
  it('returns the VAPID public key', async () => {
    const { as } = await makeApi(deps().extra);
    expect((await as('get', '/api/push/vapid-public-key')).body).toEqual({ publicKey: 'PUBKEY' });
  });
  it('stores a valid subscription (201) and rejects a malformed body (400)', async () => {
    const d = deps();
    const { as } = await makeApi(d.extra);
    expect((await as('post', '/api/push/subscribe').send(valid)).status).toBe(201);
    expect(d.subs).toHaveLength(1);
    expect((await as('post', '/api/push/subscribe').send({ endpoint: 'nope' })).status).toBe(400);
  });
  it('unsubscribes by endpoint', async () => {
    const d = deps();
    const { as } = await makeApi(d.extra);
    expect((await as('post', '/api/push/unsubscribe').send({ endpoint: valid.endpoint })).status).toBe(204);
    expect(d.subs).toEqual([`-${valid.endpoint}`]);
  });
  it('snoozes today\'s check-in', async () => {
    const d = deps();
    const { as } = await makeApi(d.extra);
    expect((await as('post', '/api/checkin/snooze')).status).toBe(204);
    expect(d.snoozed).toHaveLength(1);
  });
});
