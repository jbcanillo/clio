import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { ValidationError } from '../errors.js';

function isValidSubscription(s) {
  try {
    return Boolean(s && typeof s.endpoint === 'string' && new URL(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string');
  } catch {
    return false;
  }
}

/** Web-push subscriptions persisted in <dataDir>/subscriptions.json. */
export function createPushService({ dataDir, vapid, send, logger = console }) {
  const file = path.join(dataDir, 'subscriptions.json');
  fs.mkdirSync(dataDir, { recursive: true });

  let sender = send;
  if (!sender) {
    if (vapid?.publicKey && vapid?.privateKey) webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    sender = (subscription, payload) => webpush.sendNotification(subscription, payload);
  }

  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  };
  const save = (subs) => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(subs, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };

  async function subscribe(sub) {
    if (!isValidSubscription(sub)) throw new ValidationError('Invalid push subscription');
    const subs = load().filter((s) => s.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    save(subs);
  }

  async function unsubscribe(endpoint) {
    save(load().filter((s) => s.endpoint !== endpoint));
  }

  async function count() {
    return load().length;
  }

  async function sendToAll({ title, body, url }) {
    const payload = JSON.stringify({ title, body, url });
    const subs = load();
    const gone = new Set();
    let sent = 0;
    for (const s of subs) {
      try {
        await sender(s, payload);
        sent += 1;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) gone.add(s.endpoint);
        else logger.warn?.(`push to ${new URL(s.endpoint).host} failed: ${e?.statusCode ?? e?.message}`);
      }
    }
    if (gone.size) save(subs.filter((s) => !gone.has(s.endpoint)));
    return { sent, removed: gone.size };
  }

  return { subscribe, unsubscribe, count, sendToAll };
}
