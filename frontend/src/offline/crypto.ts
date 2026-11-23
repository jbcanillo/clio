const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** PBKDF2(SHA-256) → AES-GCM-256 key. `iterations` is lowered only in tests. */
export async function deriveKey(passphrase: string, salt: Uint8Array, iterations = 210_000): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Returns "iv.ciphertext" (base64). */
export async function seal(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(enc)}`;
}

/** Throws if the key is wrong or the data was altered. */
export async function open(key: CryptoKey, sealed: string): Promise<string> {
  const [iv, data] = sealed.split('.');
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource }, key, unb64(data) as BufferSource);
  return new TextDecoder().decode(dec);
}
