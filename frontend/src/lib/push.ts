import { apiFetch } from './api';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks for permission, subscribes this browser to push and registers it with the server. */
export async function registerPush(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await apiFetch<{ publicKey: string }>('/api/push/vapid-public-key');
  if (!publicKey) return 'unsupported';
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }));
  await apiFetch('/api/push/subscribe', { method: 'POST', json: subscription.toJSON() });
  return 'granted';
}
