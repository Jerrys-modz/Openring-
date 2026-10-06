import { fromCursor, parseFrame, xorBytes } from './frames';
import { Resp } from './constants';

type Bytes = Uint8Array;

const NO_SPO2 = new Set([0x11, 0x12, 0x13]);
const MIN_VALID_HR = 30;

export interface ActivityRecord {
  kind: 'sleep-vitals' | 'activity';
  counter: number;
  /** Unix seconds, assuming counter is in cursor space (verify on device). */
  unixSeconds: number;
  heartRate: number | null;
  hrvRmssdMs: number | null;
  signalQuality: number;
  respiratoryRate: number | null;
  spo2: number | null;
}

/** `0x4c` bulk record, 23 bytes, one per 150 s. */
export function parseBulkActivityRecord(rec: Bytes): ActivityRecord | null {
  if (rec.length < 21 || rec[0] !== 0x0c) return null;
  const counter = ((rec[1] as number) << 16) | ((rec[2] as number) << 8) | (rec[3] as number);
  const hr = rec[4] as number;
  const hrv = rec[5] as number;
  const rr = (rec[7] as number) / 8;
  const spoRaw = rec[8] as number;
  const sleepVitals = !NO_SPO2.has(spoRaw);
  return {
    kind: sleepVitals ? 'sleep-vitals' : 'activity',
    counter,
    unixSeconds: fromCursor(counter),
    heartRate: hr >= MIN_VALID_HR ? hr : null,
    hrvRmssdMs: sleepVitals && hrv > 0 ? hrv : null,
    signalQuality: rec[6] as number,
    respiratoryRate: sleepVitals && rr > 0 ? rr : null,
    spo2: sleepVitals && spoRaw >= 70 && spoRaw <= 100 ? spoRaw : null,
  };
}

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

/** `0x10` / `0x87` status descriptor, 19 bytes with XOR trailer. */
export function parseDescriptor(data: Bytes): Descriptor | null {
  if (data.length !== 19) return null;
  const id = data[0] as number;
  if (id !== Resp.Descriptor && id !== Resp.DescriptorAlt) return null;
  if (xorBytes(data.subarray(0, 18)) !== data[18]) return null;
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
