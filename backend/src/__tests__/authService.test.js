import { createAuth, AuthError } from '../services/authService.js';

const MIN = 60 * 1000;
function setup(over = {}) {
  let t = 1_000_000;
  const auth = createAuth({ password: 'correct horse', ttlHours: 8, now: () => t, ...over });
  return { auth, advance: (ms) => { t += ms; } };
}
const fail = (auth, ip = '1.1.1.1') => {
  try { auth.login('nope', ip); } catch (e) { return e; }
  throw new Error('expected login to fail');
};

describe('authService', () => {
  it('returns a 64-hex token for the right password and verifies it', () => {
    const { auth } = setup();
    const token = auth.login('correct horse', '1.1.1.1');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(auth.verify(token)).toBe(true);
  });
  it('rejects a wrong password with code "invalid"', () => {
    const { auth } = setup();
    const e = fail(auth);
    expect(e).toBeInstanceOf(AuthError);
    expect(e.code).toBe('invalid');
  });
  it('locks the IP after 5 failures, even for the correct password', () => {
    const { auth } = setup();
    for (let i = 0; i < 5; i++) fail(auth);
    expect(() => auth.login('correct horse', '1.1.1.1')).toThrow(expect.objectContaining({ code: 'locked' }));
  });
  it('lets the IP back in after 15 minutes', () => {
    const { auth, advance } = setup();
    for (let i = 0; i < 5; i++) fail(auth);
    advance(15 * MIN + 1);
    expect(auth.verify(auth.login('correct horse', '1.1.1.1'))).toBe(true);
  });
  it('does not lock a different IP', () => {
    const { auth } = setup();
    for (let i = 0; i < 5; i++) fail(auth);
    expect(auth.login('correct horse', '2.2.2.2')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('a successful login resets the failure count', () => {
    const { auth } = setup();
    for (let i = 0; i < 4; i++) fail(auth);
    auth.login('correct horse', '1.1.1.1');
    for (let i = 0; i < 4; i++) fail(auth);
    expect(() => auth.login('correct horse', '1.1.1.1')).not.toThrow();
  });
  it('expires the token after ttlHours', () => {
    const { auth, advance } = setup({ ttlHours: 1 });
    const token = auth.login('correct horse', '1.1.1.1');
    advance(60 * MIN + 1);
    expect(auth.verify(token)).toBe(false);
  });
  it('rejects unknown and empty tokens', () => {
    const { auth } = setup();
    expect(auth.verify('')).toBe(false);
    expect(auth.verify(undefined)).toBe(false);
    expect(auth.verify('a'.repeat(64))).toBe(false);
  });
  it('rejects a password of a different length without throwing a crypto error', () => {
    const { auth } = setup();
    expect(fail(auth).code).toBe('invalid');
  });
});
