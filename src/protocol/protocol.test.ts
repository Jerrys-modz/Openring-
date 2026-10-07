import { createHash } from 'crypto';
import {
  Channel, buildAck, buildAuthResponse, buildCommand, buildFetch, buildSyncOpen, fromCursor,
  macFromHex, parseAuthChallenge, bulkRemaining, parseBulkActivityFrame, parseBulkActivityRecord, parseDescriptor, recordUnixSeconds, parseEndOfHistory,
  parseFrame, parseLiveHr, sm3, toCursor, xorBytes,
} from './index';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (h: string) => Uint8Array.from(Buffer.from(h.replace(/\s+/g, ''), 'hex'));
const withXor = (b: number[]) => Uint8Array.from([...b, xorBytes(b)]);

describe('sm3', () => {
  it('matches the GB/T 32905 vectors', () => {
    expect(hex(sm3(new TextEncoder().encode('abc')))).toBe(
      '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0',
    );
    expect(hex(sm3(new TextEncoder().encode('abcd'.repeat(16))))).toBe(
      'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732',
    );
  });

  it('agrees with OpenSSL for all short inputs the protocol uses', () => {
    let openssl = true;
    try { createHash('sm3'); } catch { openssl = false; }
    if (!openssl) return; // OpenSSL build without SM3
    for (let v = 0; v < 256; v += 7) {
      for (let c = 0; c < 256; c += 5) {
        const m = Uint8Array.of(v, c);
        expect(hex(sm3(m))).toBe(createHash('sm3').update(m).digest('hex'));
      }
    }
  });
});

describe('frames', () => {
  it('builds commands with a 0x00 terminator', () => {
    expect(hex(buildFetch())).toBe('070000');
    expect(hex(buildCommand(0x01, 0x00))).toBe('010000');
    expect(hex(buildAck(0x4c))).toBe('cc0000');
    expect(hex(buildAck(0x47))).toBe('c70000');
  });

  it('validates the XOR trailer', () => {
    expect(parseFrame(withXor([0x81, 0x00, 0x42]))).not.toBeNull();
    const bad = withXor([0x81, 0x00, 0x42]);
    bad[3] = (bad[3] as number) ^ 1;
    expect(parseFrame(bad)).toBeNull();
  });

  it('parses the auth challenge and builds the SM3 response', () => {
    const challenge = parseAuthChallenge(withXor([0x81, 0x00, 0x5a]));
    expect(challenge).toBe(0x5a);
    const mac = macFromHex('AA:BB:CC:11:22:33');
    const v = 0x11 ^ 0x22 ^ 0x33;
    const expected = sm3(Uint8Array.of(v, 0x5a)).subarray(29, 32);
    const resp = buildAuthResponse(mac, 0x5a);
    expect(hex(resp)).toBe(`0101${hex(expected)}00`);
    expect(resp.length).toBe(6);
  });

  it('builds sync-open with a big-endian cursor and channel', () => {
    const cursor = toCursor(1577793600 + 0x01020304);
    expect(cursor).toBe(0x01020304);
    expect(fromCursor(cursor)).toBe(1577793600 + 0x01020304);
    expect(hex(buildSyncOpen(cursor, Channel.Awake))).toBe('0200010203040301' + '00');
    expect(hex(buildSyncOpen(0, Channel.Sleep))).toBe('020000000000' + '0001' + '00');
  });
});

describe('records', () => {
  const record = (over: Partial<Record<number, number>> = {}) => {
    const r = new Uint8Array(23);
    r[0] = 0x0c; r[3] = 0x96; r[4] = 58; r[5] = 64; r[6] = 9; r[7] = 120; r[8] = 97; r[9] = 0x0a;
    for (const [i, v] of Object.entries(over)) r[Number(i)] = v as number;
    return r;
  };

  it('decodes sleep-vitals records', () => {
    const r = parseBulkActivityRecord(record())!;
    expect(r).toMatchObject({
      kind: 'sleep-vitals', timestamp: 0x0c000096, heartRate: 58, hrvRmssdMs: 64,
      respiratoryRate: 15, spo2: 97, signalQuality: 9,
    });
    expect(r.ringClockSeconds).toBe(1577793600 + 0x0c000096);
    expect(recordUnixSeconds(r, -240)).toBe(1577793600 + 0x0c000096 + 4 * 3600);
  });

  it('treats SpO2 sentinels as activity epochs and low HR as unmeasured', () => {
    const r = parseBulkActivityRecord(record({ 8: 0x12, 4: 12 }))!;
    expect(r.kind).toBe('activity');
    expect(r.spo2).toBeNull();
    expect(r.heartRate).toBeNull();
    expect(r.hrvRmssdMs).toBeNull();
  });

  it('rejects malformed records', () => {
    expect(parseBulkActivityRecord(record({ 0: 0x00 }))).toBeNull();
    expect(parseBulkActivityRecord(new Uint8Array(5))).toBeNull();
  });

  it('decodes the descriptor', () => {
    const d = new Uint8Array(19);
    d[0] = 0x10; d[1] = 83; d[2] = 0x04; d[4] = 0x01; d[5] = 0x2c; // 300 steps
    d[6] = 0x01; d[7] = 0x6e; // 366 -> 36.6 C
    d[14] = 0x0f; d[15] = 0x3c; // 3900 mV
    d[18] = xorBytes(d.subarray(0, 18));
    expect(parseDescriptor(d)).toEqual({
      batteryPercent: 83, mode: 4, charging: true, stepsInBucket: 300,
      skinTempC1: 36.6, skinTempC2: null, batteryMv: 3900,
    });
    d[18] ^= 1;
    expect(parseDescriptor(d)).toBeNull();
  });

  it('decodes live HR and ignores warm-up samples', () => {
    expect(parseLiveHr(withXor([0x15, 0x00, 72, 0x0a, 0xb0]))).toBe(72);
    expect(parseLiveHr(withXor([0x15, 0x00, 8, 0x0a, 0xb0]))).toBeNull();
  });

  it('detects end-of-history', () => {
    expect(parseEndOfHistory(bytes('50 00 02 aa bb'))).toEqual({ eventCount: 2 });
    expect(parseEndOfHistory(bytes('87 00 00'))).toBeNull();
  });
});

import { macCandidatesFromSystemId } from './sysid';
import { base64ToBytes, bytesToBase64 } from '../util/base64';

describe('system id', () => {
  it('derives MAC candidates from an EUI-64 style System ID', () => {
    const id = Uint8Array.of(0x33, 0x22, 0x11, 0xff, 0xfe, 0xcc, 0xbb, 0xaa);
    const hexes = macCandidatesFromSystemId(id).map((m) => Buffer.from(m).toString('hex'));
    expect(hexes[0]).toBe('aabbcc112233');
    expect(new Set(hexes).size).toBe(hexes.length);
  });
  it('passes through 6-byte ids and rejects other lengths', () => {
    expect(macCandidatesFromSystemId(Uint8Array.of(1, 2, 3, 4, 5, 6))).toHaveLength(2);
    expect(macCandidatesFromSystemId(Uint8Array.of(1, 2))).toEqual([]);
  });
});

describe('base64', () => {
  it('round-trips and matches Buffer', () => {
    for (let n = 0; n < 12; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
      expect(bytesToBase64(b)).toBe(Buffer.from(b).toString('base64'));
      expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
    }
  });
});

describe('bulk activity frame', () => {
  // 4-byte big-endian timestamp (0x0c...), HR, then filler with the no-SpO2 sentinel.
  const rec = (ts: number, hr: number) =>
    Uint8Array.of((ts >>> 24) & 0xff, (ts >>> 16) & 0xff, (ts >>> 8) & 0xff, ts & 0xff, hr, 0, 0, 0, 0x11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  const frame = (seq: number, ...recs: Uint8Array[]) =>
    Uint8Array.from([0x4c, seq >> 8, seq & 0xff, ...recs.flatMap((r) => Array.from(r))]);

  it('splits records after the 2-byte sequence header, 150 s apart', () => {
    const out = parseBulkActivityFrame(frame(0, rec(0x0cba31c8, 79), rec(0x0cba325e, 80), rec(0x0cba32f4, 81), rec(0x0cba338a, 77)));
    expect(out.map((r) => [r.timestamp, r.heartRate])).toEqual([
      [0x0cba31c8, 79], [0x0cba325e, 80], [0x0cba32f4, 81], [0x0cba338a, 77],
    ]);
    expect(out[1]!.ringClockSeconds - out[0]!.ringClockSeconds).toBe(150);
  });

  it('drops a matching XOR trailer and still reads every record', () => {
    const f = frame(0, rec(0x0cbaaaf4, 74), rec(0x0cbaab8a, 94));
    const withTrailer = Uint8Array.from([...f, xorBytes(f)]);
    expect(parseBulkActivityFrame(withTrailer).map((r) => r.heartRate)).toEqual([74, 94]);
  });

  it('does not misparse when a sequence byte happens to be 0x0c', () => {
    const out = parseBulkActivityFrame(frame(0x000c, rec(0x0cb9618f, 60)));
    expect(out.map((r) => r.timestamp)).toEqual([0x0cb9618f]);
  });

  it('accepts a 0x0d timestamp high byte', () => {
    expect(parseBulkActivityFrame(frame(1, rec(0x0d000010, 61)))[0]!.timestamp).toBe(0x0d000010);
  });

  it('reads the remaining-record countdown from bulk headers', () => {
    expect(bulkRemaining(frame(0x0172, rec(0x0cb95abe, 60)))).toBe(0x172);
    expect(bulkRemaining(Uint8Array.of(0x47, 0x00, 0x39))).toBe(0x39);
    expect(bulkRemaining(Uint8Array.of(0x50, 0, 0))).toBeNull();
  });

  it('ignores other frame ids and short frames', () => {
    expect(parseBulkActivityFrame(Uint8Array.of(0x47, 1, 2, 3))).toEqual([]);
    expect(parseBulkActivityFrame(Uint8Array.of(0x4c))).toEqual([]);
  });
});
