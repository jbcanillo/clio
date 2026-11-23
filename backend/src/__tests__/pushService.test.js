import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPushService } from '../services/pushService.js';

const sub = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } });
let dataDir;
beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clio-push-')); });
const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' };

describe('pushService', () => {
  it('persists subscriptions across instances and de-duplicates by endpoint', async () => {
    const a = createPushService({ dataDir, vapid, send: async () => {} });
    await a.subscribe(sub(1));
    await a.subscribe(sub(1));
    await a.subscribe(sub(2));
    const b = createPushService({ dataDir, vapid, send: async () => {} });
    expect(await b.count()).toBe(2);
  });
  it('rejects a malformed subscription', async () => {
    const p = createPushService({ dataDir, vapid, send: async () => {} });
    await expect(p.subscribe({ endpoint: 'not a url' })).rejects.toThrow(/subscription/);
  });
  it('sends the payload as JSON to every subscription', async () => {
    const sent = [];
    const p = createPushService({ dataDir, vapid, send: async (s, payload) => { sent.push([s.endpoint, JSON.parse(payload)]); } });
    await p.subscribe(sub(1));
    await p.subscribe(sub(2));
    const res = await p.sendToAll({ title: 'T', body: 'B', url: '/?checkin=1' });
    expect(res).toEqual({ sent: 2, removed: 0 });
    expect(sent[0][1]).toEqual({ title: 'T', body: 'B', url: '/?checkin=1' });
  });
  it('removes only the subscription that answers 410 and still delivers to the others', async () => {
    const send = async (s) => { if (s.endpoint.endsWith('/1')) throw Object.assign(new Error('gone'), { statusCode: 410 }); };
    const p = createPushService({ dataDir, vapid, send });
    await p.subscribe(sub(1));
    await p.subscribe(sub(2));
    expect(await p.sendToAll({ title: 'T', body: 'B', url: '/' })).toEqual({ sent: 1, removed: 1 });
    expect(await p.count()).toBe(1);
  });
  it('keeps a subscription after a transient failure (500)', async () => {
    const p = createPushService({ dataDir, vapid, send: async () => { throw Object.assign(new Error('boom'), { statusCode: 500 }); } });
    await p.subscribe(sub(1));
    expect(await p.sendToAll({ title: 'T', body: 'B', url: '/' })).toEqual({ sent: 0, removed: 0 });
    expect(await p.count()).toBe(1);
  });
  it('unsubscribe removes by endpoint', async () => {
    const p = createPushService({ dataDir, vapid, send: async () => {} });
    await p.subscribe(sub(1));
    await p.unsubscribe(sub(1).endpoint);
    expect(await p.count()).toBe(0);
  });
});
