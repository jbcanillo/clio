import { deriveKey } from './crypto';

let key: CryptoKey | null = null;
const SALT_KEY = 'clio.salt';

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

/** The outbox key lives only in memory; it is derived from the login password. */
export async function unlockOutbox(password: string): Promise<void> {
  key = await deriveKey(password, getOrCreateSalt());
}
export const getSessionKey = async (): Promise<CryptoKey | null> => key;
export const lockOutbox = (): void => { key = null; };
