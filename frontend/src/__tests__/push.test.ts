import { registerPush } from '../lib/push';
import { todayIn } from '../lib/today';

describe('registerPush', () => {
  it('returns "unsupported" when the browser has no Notification API', async () => {
    const original = (globalThis as { Notification?: unknown }).Notification;
    // @ts-expect-error simulate a browser without notifications
    delete globalThis.Notification;
    expect(await registerPush()).toBe('unsupported');
    (globalThis as { Notification?: unknown }).Notification = original;
  });
});

describe('todayIn', () => {
  it('formats the date in the given timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T16:30:00Z'));
    expect(todayIn('Asia/Manila')).toBe('2026-04-01');
    expect(todayIn('UTC')).toBe('2026-03-31');
    vi.useRealTimers();
  });
});
