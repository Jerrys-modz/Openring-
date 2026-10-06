import { CURSOR_EPOCH, Channel, Op, Resp } from './constants';
import { sm3 } from './sm3';

export type Bytes = Uint8Array;

export const xorBytes = (bytes: ArrayLike<number>): number => {
  let x = 0;
  for (let i = 0; i < bytes.length; i++) x ^= bytes[i] as number;
  return x & 0xff;
};

/** Host -> ring: [op][sub][payload...][0x00]. No checksum. */
export function buildCommand(op: number, sub: number, payload: ArrayLike<number> = []): Bytes {
  const out = new Uint8Array(payload.length + 3);
  out[0] = op;
  out[1] = sub;
  for (let i = 0; i < payload.length; i++) out[2 + i] = payload[i] as number;
  out[out.length - 1] = 0x00;
  return out;
}

export interface Frame {
  /** Raw response id (op ^ 0x80 for command replies). */
  id: number;
  /** Bytes between the id and the trailing XOR. */
  payload: Bytes;
}

/**
 * Ring -> host: [id][payload...][xor of all preceding bytes].
 * Returns null if too short or the trailer does not match. `0x50` end-of-history
 * frames and `0x47`/`0x4c` bulk frames have different framing; see their helpers.
 */
export function parseFrame(data: Bytes): Frame | null {
  if (data.length < 2) return null;
  const trailer = data[data.length - 1] as number;
  if (xorBytes(data.subarray(0, data.length - 1)) !== trailer) return null;
  return { id: data[0] as number, payload: data.subarray(1, data.length - 1) };
}

/** `81 00 <challenge> <xor>` sent by the ring on every connection. */
export function parseAuthChallenge(data: Bytes): number | null {
  const f = parseFrame(data);
  if (!f || f.id !== Resp.Status || f.payload.length < 2 || f.payload[0] !== 0x00) return null;
  return f.payload[1] as number;
}

/** Response to the challenge: `01 01 r0 r1 r2 00`, keyed on the ring's own MAC. */
export function buildAuthResponse(mac: ArrayLike<number>, challenge: number): Bytes {
  if (mac.length !== 6) throw new Error('MAC must be 6 bytes');
  const v = ((mac[3] as number) ^ (mac[4] as number) ^ (mac[5] as number)) & 0xff;
  const digest = sm3(Uint8Array.of(v, challenge & 0xff));
  return buildCommand(Op.Status, 0x01, digest.subarray(29, 32));
}

/** DIS System ID (0x2A23) -> MAC. Format of the 8-byte value is validated on-device. */
export function macFromHex(hex: string): Bytes {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length !== 12) throw new Error('expected 12 hex chars');
  const out = new Uint8Array(6);
  for (let i = 0; i < 6; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const toCursor = (unixSeconds: number): number =>
  Math.max(0, Math.floor(unixSeconds) - CURSOR_EPOCH) >>> 0;
export const fromCursor = (cursor: number): number => (cursor >>> 0) + CURSOR_EPOCH;

/** `02 00 <cursor:4 BE> <channel> 01 00` */
export function buildSyncOpen(cursor: number, channel: Channel): Bytes {
  const c = cursor >>> 0;
  return buildCommand(Op.SyncOpen, 0x00, [
    (c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff,
    channel,
    0x01,
  ]);
}

export const buildFetch = (): Bytes => buildCommand(Op.Fetch, 0x00);
export const buildStatusQuery = (): Bytes => buildCommand(Op.StatusQuery, 0x00);
export const buildLiveHrMode = (): Bytes => buildCommand(Op.LiveHrMode, 0x01);
export const buildLiveHrPoll = (): Bytes => buildCommand(Op.Poll, 0x00);
export const buildAck = (bulkId: number): Bytes =>
  buildCommand(bulkId === Resp.BulkPpg ? Op.AckPpg : Op.AckActivity, 0x00);
