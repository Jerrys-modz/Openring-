import { bucketHeartRate, formatRingClock, formatRingDay, summarizeHeartRate } from './stats';
import { demoRecords } from '../demo';
import { parseBulkActivityRecord } from '../protocol';

jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));

const rec = (ts: number, hr: number) => {
  const r = new Uint8Array(23);
  r[0] = (ts >>> 24) & 0xff; r[1] = (ts >>> 16) & 0xff; r[2] = (ts >>> 8) & 0xff; r[3] = ts & 0xff;
  r[4] = hr; r[8] = 0x12;
  return parseBulkActivityRecord(r)!;
};

describe('summarizeHeartRate', () => {
  it('summarises valid heart rates and ignores unmeasured ones', () => {
    const s = summarizeHeartRate([rec(0x0cbaaaf4, 74), rec(0x0cbaab8a, 94), rec(0x0cbaac20, 20)]);
    expect(s).toMatchObject({ count: 2, min: 74, avg: 84, max: 94 });
    expect(s.last! - s.first!).toBe(0x0cbaac20 - 0x0cbaaaf4);
  });

  it('is empty-safe', () => {
    expect(summarizeHeartRate([])).toEqual({ count: 0, min: null, avg: null, max: null, first: null, last: null });
  });
});

describe('bucketHeartRate', () => {
  it('averages per bucket over a window ending at the newest record', () => {
    const end = 0x0cbaac20;
    const b = bucketHeartRate([rec(end - 1, 60), rec(end - 150, 80), rec(end - 3000, 100)], 1800, 4);
    expect(b).toHaveLength(4);
    expect(b[3]).toMatchObject({ avg: 70, min: 60, max: 80, n: 2 });
    expect(b.filter((x) => x.avg === null).length).toBe(2);
    expect(b[3]!.start - b[2]!.start).toBe(1800);
  });

  it('drops records outside the window', () => {
    const end = 1577793600 + 0x0cbaac20 + 1; // ring-clock seconds
    const b = bucketHeartRate([rec(0x0cbaaaf4, 70), rec(0x0cbaac20, 90)], 60, 2, end);
    expect(b.map((x) => x.n)).toEqual([0, 1]);
  });
});

describe('ring clock formatting', () => {
  it('reads ring-clock seconds as local wall time', () => {
    // 0x0cbaacb6 is 2026-10-07 06:21:42 on the ring clock.
    expect(formatRingClock(1577793600 + 0x0cbaacb6)).toBe('6:21 AM');
    expect(formatRingDay(1577793600 + 0x0cbaacb6)).toBe('Wed Oct 7');
    expect(formatRingClock(1577793600 + 0x0cbaacb6 + 6 * 3600)).toBe('12:21 PM');
  });
});

describe('demoRecords', () => {
  it('produces 24 h of plausible, ordered samples with gaps', () => {
    const d = demoRecords();
    expect(d.length).toBeGreaterThan(450);
    expect(d.length).toBeLessThan(576);
    expect(d.every((r, i) => i === 0 || r.timestamp > d[i - 1]!.timestamp)).toBe(true);
    const s = summarizeHeartRate(d);
    expect(s.min!).toBeGreaterThan(40);
    expect(s.max!).toBeLessThan(140);
  });
});
