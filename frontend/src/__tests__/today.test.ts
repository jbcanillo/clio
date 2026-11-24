import { nextNineAm, tomorrowNineAm } from '../lib/today';

describe('nextNineAm', () => {
  it('uses today when it is before 09:00 in the zone', () => {
    expect(nextNineAm('UTC', new Date('2026-11-23T08:59:00Z'))).toBe('2026-11-23T09:00:00+00:00');
  });
  it('uses tomorrow at or after 09:00', () => {
    expect(nextNineAm('UTC', new Date('2026-11-23T09:00:00Z'))).toBe('2026-11-24T09:00:00+00:00');
    expect(nextNineAm('UTC', new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01T09:00:00+00:00');
  });
  it('works across a timezone offset (Asia/Manila is +08:00)', () => {
    // 00:30Z is 08:30 in Manila -> today
    expect(nextNineAm('Asia/Manila', new Date('2026-11-23T00:30:00Z'))).toBe('2026-11-23T09:00:00+08:00');
    // 01:30Z is 09:30 in Manila -> tomorrow
    expect(nextNineAm('Asia/Manila', new Date('2026-11-23T01:30:00Z'))).toBe('2026-11-24T09:00:00+08:00');
    // 20:00Z on the 22nd is already the 23rd in Manila
    expect(nextNineAm('Asia/Manila', new Date('2026-11-22T20:00:00Z'))).toBe('2026-11-23T09:00:00+08:00');
  });
  it('uses the offset in force on the target day (DST)', () => {
    expect(nextNineAm('America/New_York', new Date('2026-03-07T20:00:00Z'))).toBe('2026-03-08T09:00:00-04:00');
    expect(nextNineAm('America/New_York', new Date('2026-01-10T20:00:00Z'))).toBe('2026-01-11T09:00:00-05:00');
  });
});

describe('tomorrowNineAm', () => {
  it("is tomorrow's 09:00 in the owner's zone even before 09:00 today", () => {
    expect(tomorrowNineAm('UTC', new Date('2026-11-23T08:59:00Z'))).toBe('2026-11-24T09:00:00+00:00');
    expect(tomorrowNineAm('UTC', new Date('2026-11-23T23:59:00Z'))).toBe('2026-11-24T09:00:00+00:00');
    // 00:30Z is 08:30 on the 23rd in Manila: tomorrow there is the 24th
    expect(tomorrowNineAm('Asia/Manila', new Date('2026-11-23T00:30:00Z'))).toBe('2026-11-24T09:00:00+08:00');
    // 20:00Z on the 22nd is already the 23rd in Manila
    expect(tomorrowNineAm('Asia/Manila', new Date('2026-11-22T20:00:00Z'))).toBe('2026-11-24T09:00:00+08:00');
  });
  it('uses the offset in force on the target day (DST)', () => {
    expect(tomorrowNineAm('America/New_York', new Date('2026-03-07T20:00:00Z'))).toBe('2026-03-08T09:00:00-04:00');
  });
});
