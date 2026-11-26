import { deriveKey, open, seal } from './crypto';

let key: CryptoKey | null = null;
/** Unlocked against the local verifier because the server could not be reached. */
let offlineSession = false;
const SALT_KEY = 'clio.salt';
/** A tiny value sealed with the key: lets the password be checked offline, without the server. */
const VERIFIER_KEY = 'clio.verifier';
const VERIFIER_TEXT = 'clio-offline-verifier';

function getOrCreateSalt(): Uint8Array {
  try {
    const saved = localStorage.getItem(SALT_KEY);
    if (saved) return Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)));
    return salt;
  } catch {
    return new Uint8Array(16); // storage unavailable: still deterministic within this session
  }
}

const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('clio-auth')); };

/** Encrypted offline storage needs Web Crypto (secure contexts only) and IndexedDB. */
export function offlineSupported(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';
}

/** After the server accepted the password: derive the key and refresh the offline verifier. */
export async function unlockOutbox(password: string): Promise<void> {
  key = await deriveKey(password, getOrCreateSalt());
  offlineSession = false;
  try {
    localStorage.setItem(VERIFIER_KEY, await seal(key, VERIFIER_TEXT));
  } catch { /* storage unavailable: offline unlock just won't be possible */ }
  notify();
}

/** True when this device has unlocked online before, so an offline unlock can be checked. */
export function canUnlockOffline(): boolean {
  try {
    return offlineSupported() && localStorage.getItem(VERIFIER_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Unlocks without the server by opening the verifier. Resolves false on a wrong password
 * (or when this device was never unlocked online).
 */
export async function unlockOffline(password: string): Promise<boolean> {
  let sealed: string | null = null;
  try { sealed = localStorage.getItem(VERIFIER_KEY); } catch { /* ignore */ }
  if (!sealed || !offlineSupported()) return false;
  const candidate = await deriveKey(password, getOrCreateSalt());
  try {
    if ((await open(candidate, sealed)) !== VERIFIER_TEXT) return false;
  } catch {
    return false;
  }
  key = candidate;
  offlineSession = true;
  notify();
  return true;
}

export const getSessionKey = async (): Promise<CryptoKey | null> => key;
export const isUnlocked = (): boolean => key !== null;
export const lockOutbox = (): void => { key = null; offlineSession = false; notify(); };
export const isOfflineSession = (): boolean => offlineSession;
/** The server is reachable again: the next screen asks for the password to get a real session. */
export const endOfflineSession = (): void => {
  if (!offlineSession) return;
  offlineSession = false;
  notify();
};
