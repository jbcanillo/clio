import crypto from 'node:crypto';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export class AuthError extends Error {
  constructor(code) {
    super(code === 'locked' ? 'Too many failed attempts' : 'Invalid password');
    this.code = code; // 'invalid' | 'locked'
  }
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** Single-owner password login with session tokens and per-IP lockout. */
export function createAuth({ password, ttlHours, now = () => Date.now() }) {
  const sessions = new Map(); // token -> expiresAt
  const failures = new Map(); // ip -> { count, lockedUntil }

  function login(candidate, ip) {
    const f = failures.get(ip);
    if (f && f.lockedUntil > now()) throw new AuthError('locked');
    if (f && f.lockedUntil && f.lockedUntil <= now()) failures.delete(ip);

    // Hash both sides so the comparison is constant-time regardless of length.
    const ok = crypto.timingSafeEqual(sha(candidate), sha(password));
    if (!ok) {
      const cur = failures.get(ip) || { count: 0, lockedUntil: 0 };
      cur.count += 1;
      if (cur.count >= MAX_FAILURES) cur.lockedUntil = now() + LOCK_MS;
      failures.set(ip, cur);
      throw new AuthError('invalid');
    }
    failures.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, now() + ttlHours * 3600 * 1000);
    return token;
  }

  function verify(token) {
    if (!token || typeof token !== 'string') return false;
    const exp = sessions.get(token);
    if (!exp) return false;
    if (exp <= now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  return { login, verify };
}
