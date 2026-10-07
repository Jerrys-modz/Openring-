import { StepTracker, hrKey, pendingHeartRate } from './mapping';
import { parseBulkActivityRecord } from '../protocol';

const rec = (ts: number, hr: number) => {
  const r = new Uint8Array(23);
  r[0] = (ts >>> 24) & 0xff; r[1] = (ts >>> 16) & 0xff; r[2] = (ts >>> 8) & 0xff; r[3] = ts & 0xff;
  r[4] = hr; r[8] = 0x12;
  return parseBulkActivityRecord(r)!;
};

describe('pendingHeartRate', () => {
  const records = [rec(0x0cbaaaf4, 74), rec(0x0cbaab8a, 20), rec(0x0cbaac20, 99)];

  it('skips unmeasured heart rates and anything already written', () => {
    const out = pendingHeartRate(records, new Set([hrKey(0x0cbaaaf4)]), -240);
    expect(out.map((s) => s.bpm)).toEqual([99]);
  });

  it('converts the ring clock to a real unix time using the UTC offset', () => {
    const [s] = pendingHeartRate([rec(0x0cbaaaf4, 74)], new Set(), -240);
    // 0x0cbaaaf4 reads 2026-10-07 06:14:12 on the ring clock; in UTC-4 that is 10:14:12 UTC.
    expect(new Date(s!.unixSeconds * 1000).toISOString()).toBe('2026-10-07T10:14:12.000Z');
    expect(s!.key).toBe(hrKey(0x0cbaaaf4));
  });
});

describe('StepTracker', () => {
  // 2026-10-07 10:20 UTC is 06:20 in UTC-4, inside the quarter-hour 06:15 to 06:30.
  const at = (hhmm: string) => Date.parse(`2026-10-07T${hhmm}:00Z`) / 1000;

  it('keeps the largest value in a quarter and returns it when the next quarter starts', () => {
    const t = new StepTracker(-240);
    expect(t.observe(10, at('10:16'))).toBeNull();
    expect(t.observe(123, at('10:25'))).toBeNull();
    expect(t.observe(100, at('10:26'))).toBeNull(); // a lower reading never reduces it
    const done = t.observe(4, at('10:31'))!;
    expect(done.steps).toBe(123);
    expect(new Date(done.startUnix * 1000).toISOString()).toBe('2026-10-07T10:15:00.000Z');
    expect(new Date(done.endUnix * 1000).toISOString()).toBe('2026-10-07T10:30:00.000Z');
  });

  it('writes nothing for a quarter with no steps and can flush the current quarter', () => {
    const t = new StepTracker(-240);
    t.observe(0, at('10:16'));
    expect(t.observe(0, at('10:31'))).toBeNull();
    t.observe(7, at('10:35'));
    expect(t.peek()!.steps).toBe(7);
  });

  it('gives a larger count in the same quarter a different key so it is written again', () => {
    const t = new StepTracker(0);
    t.observe(5, at('10:01'));
    const a = t.peek()!.key;
    t.observe(9, at('10:05'));
    expect(t.peek()!.key).not.toBe(a);
  });
});
