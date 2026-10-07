# Hardware findings

What has been confirmed on a real ring (RingConn Gen 2, iPhone, OpenRing TestFlight build).
Anything not listed here is still an assumption from the protocol notes in `docs/PLAN.md`.

## Confirmed
- **Advertised name:** `RingConn Gen2-XXXX` (last four hex digits of the MAC). The
  `RingConn` name-prefix scan finds it. The ring only advertises while nothing else is
  connected to it, so close the vendor app first.
- **System ID (0x2A23):** the value is 6 bytes, and it is the MAC as-is (no EUI-64 `ff fe`
  splice, no byte reversal). It is the first candidate the client tries, and the auth
  handshake succeeded with it.
- **Handshake:** the ring does not send the `81 00 <challenge>` frame on its own after
  subscribing. Sending a status read (`01 00 00`) makes it reply with the challenge, then
  the SM3 response `01 01 r0 r1 r2 00` is accepted (`81 01 ...` status back).
- **Live heart rate:** `06 01 00` enters live mode, `95 00 00` polled about every 2.2 s
  returns `15 00 <hr> 0a b0 <xor>`. The first few polls time out or return a value under
  30 while the sensor warms up.
- **Status descriptor:** the ring also pushes a 19-byte `10 ...` descriptor frame after auth.

## Confirmed: history drain (sleep channel 0x00)
- Flow works as in `PLAN.md`: `02 00 <cursor:4> 00 01 00`, then `07 00 00`; the ring answers
  `82 00 00 82`, a descriptor, then bulk frames. ACK each with `cc 00 00` (`0x4c`) or
  `c7 00 00` (`0x47`). A `0x50` frame ends the drain. One 24 h drain was 76 frames, 362 records.
- `0x4c` frame layout: `4c <seq:2 BE> <record:23>...`, no XOR trailer (95 bytes = 4 records).
  The sequence value is the index of the frame's first record, so it can contain `0x0c`; do not
  scan for a marker byte.
- **Record timestamp:** the first 4 bytes of each record are a big-endian count of seconds since
  2019-12-31 12:00 UTC, the same space as the cursor. The leading `0x0c` is the high byte, not a
  marker: it turns into `0x0d` around 2026-11-28, so never match on it. Consecutive records are
  150 s apart. Pages arrive newest first.
- The cursor sent in sync-open is the same 4-byte format, so "since" is a plain unix time.
- `0x47` PPG snapshot frames arrive too (many of them, before the `0x4c` frames); ACK and skip them.
- The `0x50` end frame carried more than a count: `50 00 00` followed by 6-byte entries that
  contain record timestamps (`<type> <flag> 0c xx xx xx`). Possibly sleep-stage or event markers.
  Layout unknown; `eventCount` in `parseEndOfHistory` is not a reliable count.
- The ring keeps pushing `15 ...` live-HR frames and `10/87` descriptors while a drain runs, even
  after we stop polling. Ignore them.

## Not yet confirmed
- **Awake channel (0x03):** the first test returned no bulk frames within ~7 s; a `0x50` frame
  arrived about 25 s later, after we had given up. The drain now waits up to ~30 s. It may simply
  have nothing new (the ring keeps its own resume pointer), or live mode may block it.
- Meaning of the `0x50` event entries, and whether they are sleep stages.
- Skin temperature encoding, SpO2 and HRV values against the vendor app.
- Whether the newest record is always a few hours old (the first drain ended about 4 h before
  the sync), which would mean the ring flushes in batches.

## Privacy
Do not commit the ring's MAC, System ID or captured frames that contain it.
