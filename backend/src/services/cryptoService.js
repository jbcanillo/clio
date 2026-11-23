import crypto from 'node:crypto';

const SALT = Buffer.from('clio-secret-store-v1');

function deriveKey(secretKey) {
  return crypto.scryptSync(secretKey, SALT, 32);
}

/** AES-256-GCM. Returns "iv.tag.ciphertext" (base64 parts). */
export function encryptString(plain, secretKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secretKey), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

/** Throws if the payload was tampered with or the key is wrong. */
export function decryptString(payload, secretKey) {
  const [iv, tag, enc] = String(payload).split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !enc) throw new Error('Malformed encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secretKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
