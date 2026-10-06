type Bytes = Uint8Array;

const rev = (b: Bytes): Bytes => Uint8Array.from(b).reverse();
const cat = (...parts: ArrayLike<number>[]): Bytes =>
  Uint8Array.from(parts.flatMap((p) => Array.from(p)));

/**
 * The ring exposes its MAC through the Device Information "System ID" (0x2A23). The
 * exact byte order has not been confirmed on hardware, so return every plausible
 * 6-byte MAC, most likely first; the client tries them until authentication succeeds.
 *
 * Bluetooth's System ID is 8 bytes: 5-byte manufacturer id + 3-byte OUI, usually the MAC
 * with 0xFF 0xFE spliced into the middle (EUI-64 style), least-significant byte first.
 */
export function macCandidatesFromSystemId(id: Bytes): Bytes[] {
  const out: Bytes[] = [];
  const add = (b: Bytes) => {
    if (b.length === 6 && !out.some((o) => o.every((v, i) => v === b[i]))) out.push(b);
  };
  if (id.length === 6) {
    add(id);
    add(rev(id));
  } else if (id.length === 8) {
    if (id[3] === 0xff && id[4] === 0xfe) {
      const head = id.subarray(0, 3);
      const tail = id.subarray(5, 8);
      add(rev(cat(head, tail)));
      add(cat(head, tail));
      add(cat(tail, head));
      add(rev(cat(tail, head)));
    }
    add(id.subarray(0, 6));
    add(rev(id.subarray(2, 8)));
  }
  return out;
}
