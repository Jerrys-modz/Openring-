// SM3 hash (GB/T 32905-2016), 256-bit. Pure TypeScript, no dependencies.

const IV = [
  0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
  0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
];

const rotl = (x: number, n: number): number => {
  const s = n & 31;
  return s === 0 ? x >>> 0 : ((x << s) | (x >>> (32 - s))) >>> 0;
};

const p0 = (x: number): number => (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0;
const p1 = (x: number): number => (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0;

const ff = (j: number, x: number, y: number, z: number): number =>
  j < 16 ? (x ^ y ^ z) >>> 0 : ((x & y) | (x & z) | (y & z)) >>> 0;
const gg = (j: number, x: number, y: number, z: number): number =>
  j < 16 ? (x ^ y ^ z) >>> 0 : ((x & y) | (~x & z)) >>> 0;

function compress(v: number[], block: Uint8Array, offset: number): void {
  const w = new Array<number>(68);
  const wp = new Array<number>(64);
  for (let j = 0; j < 16; j++) {
    const i = offset + j * 4;
    w[j] =
      (((block[i] as number) << 24) |
        ((block[i + 1] as number) << 16) |
        ((block[i + 2] as number) << 8) |
        (block[i + 3] as number)) >>>
      0;
  }
  for (let j = 16; j < 68; j++) {
    w[j] =
      (p1(((w[j - 16] as number) ^ (w[j - 9] as number) ^ rotl(w[j - 3] as number, 15)) >>> 0) ^
        rotl(w[j - 13] as number, 7) ^
        (w[j - 6] as number)) >>>
      0;
  }
  for (let j = 0; j < 64; j++) wp[j] = ((w[j] as number) ^ (w[j + 4] as number)) >>> 0;

  let [a, b, c, d, e, f, g, h] = v as [number, number, number, number, number, number, number, number];
  for (let j = 0; j < 64; j++) {
    const t = j < 16 ? 0x79cc4519 : 0x7a879d8a;
    const ss1 = rotl((rotl(a, 12) + e + rotl(t, j % 32)) >>> 0, 7);
    const ss2 = (ss1 ^ rotl(a, 12)) >>> 0;
    const tt1 = (ff(j, a, b, c) + d + ss2 + (wp[j] as number)) >>> 0;
    const tt2 = (gg(j, e, f, g) + h + ss1 + (w[j] as number)) >>> 0;
    d = c;
    c = rotl(b, 9);
    b = a;
    a = tt1;
    h = g;
    g = rotl(f, 19);
    f = e;
    e = p0(tt2);
  }
  const out = [a, b, c, d, e, f, g, h];
  for (let i = 0; i < 8; i++) v[i] = ((v[i] as number) ^ (out[i] as number)) >>> 0;
}

export function sm3(message: Uint8Array): Uint8Array {
  const bitLen = message.length * 8;
  const padLen = (((message.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(padLen);
  padded.set(message);
  padded[message.length] = 0x80;
  // 64-bit big-endian bit length (messages here are tiny; high word kept for correctness)
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padLen - 4, bitLen >>> 0);

  const v = IV.slice();
  for (let off = 0; off < padLen; off += 64) compress(v, padded, off);

  const digest = new Uint8Array(32);
  const dv = new DataView(digest.buffer);
  for (let i = 0; i < 8; i++) dv.setUint32(i * 4, v[i] as number);
  return digest;
}
