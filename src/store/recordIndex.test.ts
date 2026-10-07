import { RecordIndex, recordsToCsv } from './recordIndex';
import { parseBulkActivityRecord } from '../protocol';

const rec = (ts: number, hr: number, spo2 = 0x12) => {
  const r = new Uint8Array(23);
  r[0] = (ts >>> 24) & 0xff; r[1] = (ts >>> 16) & 0xff; r[2] = (ts >>> 8) & 0xff; r[3] = ts & 0xff;
  r[4] = hr; r[6] = 3; r[8] = spo2;
  return parseBulkActivityRecord(r)!;
};

describe('RecordIndex', () => {
  it('keeps one record per timestamp and reports whether a record was new', () => {
    const idx = new RecordIndex();
    expect(idx.add(rec(0x0cbaaaf4, 74))).toBe(true);
    expect(idx.add(rec(0x0cbaaaf4, 74))).toBe(false);
    expect(idx.size).toBe(1);
    expect(idx.conflicts).toBe(0);
  });

  it('counts a same-timestamp record with different bytes as a conflict and keeps the first', () => {
    const idx = new RecordIndex();
    idx.add(rec(0x0cbaaaf4, 74));
    expect(idx.add(rec(0x0cbaaaf4, 80))).toBe(false);
    expect(idx.conflicts).toBe(1);
    expect(idx.sorted()[0]!.heartRate).toBe(74);
  });

  it('sorts oldest first and reports the range', () => {
    const idx = new RecordIndex();
    idx.add(rec(0x0cbaab8a, 94));
    idx.add(rec(0x0cbaaaf4, 74));
    expect(idx.sorted().map((r) => r.heartRate)).toEqual([74, 94]);
    expect(idx.range()!.first.timestamp).toBe(0x0cbaaaf4);
    expect(idx.range()!.last.timestamp).toBe(0x0cbaab8a);
    expect(new RecordIndex().range()).toBeNull();
  });
});

describe('recordsToCsv', () => {
  it('writes a header and one row per record using the ring clock, leaving unmeasured values blank', () => {
    const csv = recordsToCsv([rec(0x0cbaaaf4, 74), rec(0x0cbaab8a, 20)]).split('\n');
    expect(csv[0]).toBe('ring_time,kind,hr_bpm,hrv_rmssd_ms,resp_rate,spo2,quality,raw');
    expect(csv[1]).toMatch(/^2026-10-07 06:14:12,activity,74,,,,3,0cbaaaf4/);
    expect(csv[2]).toMatch(/^2026-10-07 06:16:42,activity,,,,,3,0cbaab8a/); // 20 bpm is below the valid-HR floor
  });
});
