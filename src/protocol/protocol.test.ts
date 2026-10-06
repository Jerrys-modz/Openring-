import { createHash } from 'crypto';
import {
  Channel, buildAck, buildAuthResponse, buildCommand, buildFetch, buildSyncOpen, fromCursor,
  macFromHex, parseAuthChallenge, parseBulkActivityRecord, parseDescriptor, parseEndOfHistory,
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
      kind: 'sleep-vitals', counter: 0x96, heartRate: 58, hrvRmssdMs: 64,
      respiratoryRate: 15, spo2: 97, signalQuality: 9,
    });
    expect(r.unixSeconds).toBe(1577793600 + 0x96);
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
