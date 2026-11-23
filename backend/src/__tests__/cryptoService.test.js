import { encryptString, decryptString } from '../services/cryptoService.js';

const key = 'k'.repeat(32);

describe('cryptoService', () => {
  it('round-trips text including unicode', () => {
    const text = 'sk-or-123 ☕ naïve';
    expect(decryptString(encryptString(text, key), key)).toBe(text);
  });
  it('produces different ciphertext for the same input (random IV)', () => {
    expect(encryptString('a', key)).not.toBe(encryptString('a', key));
  });
  it('throws when the payload was tampered with', () => {
    const p = encryptString('secret', key);
    const parts = p.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    expect(() => decryptString(parts.join('.'), key)).toThrow();
  });
  it('throws when decrypted with a different key', () => {
    expect(() => decryptString(encryptString('x', key), 'j'.repeat(32))).toThrow();
  });
});
