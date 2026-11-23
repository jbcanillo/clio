import { todayKey } from '../services/timeUtil.js';

describe('todayKey', () => {
  it('follows the owner timezone, not UTC', () => {
    const instant = new Date('2026-03-31T16:30:00Z');
    expect(todayKey(instant, 'Asia/Manila')).toBe('2026-04-01');
    expect(todayKey(instant, 'UTC')).toBe('2026-03-31');
  });
  it('handles the day boundary at 23:59 and 00:01 local', () => {
    expect(todayKey(new Date('2026-05-01T15:59:00Z'), 'Asia/Manila')).toBe('2026-05-01');
    expect(todayKey(new Date('2026-05-01T16:01:00Z'), 'Asia/Manila')).toBe('2026-05-02');
  });
  it('is correct around a DST change', () => {
    expect(todayKey(new Date('2026-03-08T04:59:00Z'), 'America/New_York')).toBe('2026-03-07');
    expect(todayKey(new Date('2026-03-08T06:59:00Z'), 'America/New_York')).toBe('2026-03-08');
    expect(todayKey(new Date('2026-03-08T07:01:00Z'), 'America/New_York')).toBe('2026-03-08');
  });
});
