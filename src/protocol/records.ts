import { fromCursor, parseFrame, xorBytes } from './frames';
import { Resp } from './constants';

type Bytes = Uint8Array;

const NO_SPO2 = new Set([0x11, 0x12, 0x13]);
const MIN_VALID_HR = 30;
/** About Aug 2021 in cursor space; anything earlier cannot be a real RingConn record. */
const MIN_TIMESTAMP = 0x03000000;

export interface ActivityRecord {
  kind: 'sleep-vitals' | 'activity';
  /** First 4 bytes of the record: big-endian seconds since the cursor epoch (confirmed on a Gen 2 ring). */
  timestamp: number;
  /** The undecoded 23 record bytes as hex, so stored data can be re-decoded if the layout turns out different. */
  rawHex: string;
  /**
   * `timestamp` as unix seconds *if the ring's clock were UTC*. The ring stores device-local wall
   * time in this field, so this is NOT a real unix time; use `recordUnixSeconds`.
   */
  ringClockSeconds: number;
  heartRate: number | null;
  hrvRmssdMs: number | null;
  signalQuality: number;
  respiratoryRate: number | null;
  spo2: number | null;
}

/**
 * `0x4c` bulk record, 23 bytes, one per 150 s. Bytes 0-3 are a 4-byte big-endian timestamp
 * (the top byte is 0x0c until late Nov 2026, then 0x0d, so it must not be treated as a marker).
 */
export function parseBulkActivityRecord(rec: Bytes): ActivityRecord | null {
  if (rec.length < 21) return null;
  const timestamp =
    (((rec[0] as number) << 24) | ((rec[1] as number) << 16) | ((rec[2] as number) << 8) | (rec[3] as number)) >>> 0;
  if (timestamp < MIN_TIMESTAMP) return null;
  const hr = rec[4] as number;
  const hrv = rec[5] as number;
  const rr = (rec[7] as number) / 8;
  const spoRaw = rec[8] as number;
  const sleepVitals = !NO_SPO2.has(spoRaw);
  return {
    kind: sleepVitals ? 'sleep-vitals' : 'activity',
    timestamp,
    rawHex: Array.from(rec.subarray(0, 23), (b) => b.toString(16).padStart(2, '0')).join(''),
    ringClockSeconds: fromCursor(timestamp),
    heartRate: hr >= MIN_VALID_HR ? hr : null,
    hrvRmssdMs: sleepVitals && hrv > 0 ? hrv : null,
    signalQuality: rec[6] as number,
    respiratoryRate: sleepVitals && rr > 0 ? rr : null,
    spo2: sleepVitals && spoRaw >= 70 && spoRaw <= 100 ? spoRaw : null,
  };
}

/**
 * Real unix time of a record. The ring writes local wall-clock time (confirmed on a Gen 2 ring: the
 * newest record was always ~4 min before the sync, but 4 h early when read as UTC in a UTC-4 zone).
 * `utcOffsetMinutes` is the ring's UTC offset, east positive (US Eastern in summer: -240).
 */
export const recordUnixSeconds = (r: ActivityRecord, utcOffsetMinutes: number): number =>
  r.ringClockSeconds - utcOffsetMinutes * 60;

export interface Descriptor {
  batteryPercent: number;
  mode: number;
  charging: boolean;
  /** Quarter-hour bucket; the ring clears it at :00/:15/:30/:45. */
  stepsInBucket: number;
  /** Raw 0.1 °C channels, null when outside a plausible 20–45 °C skin range. */
  skinTempC1: number | null;
  skinTempC2: number | null;
  batteryMv: number;
}

const tempC = (raw: number): number | null => (raw >= 200 && raw <= 450 ? raw / 10 : null);

/** `0x87` status descriptor (19 bytes) or `0x10` (20 bytes, one extra byte), each ending in an XOR trailer. */
export function parseDescriptor(data: Bytes): Descriptor | null {
  if (data.length !== 19 && data.length !== 20) return null;
  const id = data[0] as number;
  if (id !== Resp.Descriptor && id !== Resp.DescriptorAlt) return null;
  if (xorBytes(data.subarray(0, data.length - 1)) !== data[data.length - 1]) return null;
  const u16 = (i: number) => ((data[i] as number) << 8) | (data[i + 1] as number);
  const mode = data[2] as number;
  return {
    batteryPercent: data[1] as number,
    mode,
    charging: mode === 0x04,
    stepsInBucket: u16(4),
    skinTempC1: tempC(u16(6)),
    skinTempC2: tempC(u16(8)),
    batteryMv: u16(14),
  };
}

/** Live HR reply `15 00 <hr> 0a b0 <xor>`; null while the sensor is still warming up. */
export function parseLiveHr(data: Bytes): number | null {
  const f = parseFrame(data);
  if (!f || f.id !== Resp.LiveHr || f.payload.length < 2) return null;
  const hr = f.payload[1] as number;
  return hr >= MIN_VALID_HR ? hr : null;
}

/** `0x50 00 <count> ...` marks the end of a history drain (no XOR trailer). */
export function parseEndOfHistory(data: Bytes): { eventCount: number } | null {
  if (data.length < 3 || data[0] !== Resp.EndOfHistory) return null;
  return { eventCount: data[2] as number };
}

const BULK_RECORD_LEN = 23;

/**
 * Records still to come after this page: bytes 1-2 of a `0x47`/`0x4c` bulk frame (big-endian),
 * counting down to 0 on the last page. Null for other frames.
 */
export function bulkRemaining(data: Bytes): number | null {
  if (data.length < 3 || (data[0] !== Resp.BulkActivity && data[0] !== Resp.BulkPpg)) return null;
  return ((data[1] as number) << 8) | (data[2] as number);
}

/**
 * Split a `0x4c` bulk frame: `4c <remaining:2 BE> <record:23>... <xor>` (a 4-record frame is 96
 * bytes; the XOR trailer is dropped when it matches). Pages arrive oldest first; the header counts
 * down to 0. The header can contain `0x0c`, so never scan for a marker byte.
 */
export function parseBulkActivityFrame(data: Bytes): ActivityRecord[] {
  if (data.length < 3 + BULK_RECORD_LEN || data[0] !== Resp.BulkActivity) return [];
  const end = xorBytes(data.subarray(0, data.length - 1)) === data[data.length - 1] ? data.length - 1 : data.length;
  const out: ActivityRecord[] = [];
  for (let i = 3; i + BULK_RECORD_LEN <= end; i += BULK_RECORD_LEN) {
    const rec = parseBulkActivityRecord(data.subarray(i, i + BULK_RECORD_LEN));
    if (rec) out.push(rec);
  }
  return out;
}
