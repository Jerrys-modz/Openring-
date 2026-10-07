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

## Confirmed: the ring's resume pointer (drains are destructive)
- A second drain, 14 minutes after the first and with a cursor 24 h in the past, returned only
  the 5 records after the last one of the first drain (150 s later). The ring keeps its own
  pointer and does not resend records it has sent, whatever cursor we ask for.
- Consequences: (1) every frame must be saved before it is ACKed (`src/store/historyStore.ts`;
  the drain stops without ACKing if saving fails); (2) the vendor app shares this pointer, so
  records drained by OpenRing before storage existed are not on the phone and the vendor app
  may never see them.
- With nothing new, the ring answers the sync-open (`82 00 00 82`) and then stays silent: no
  `0x50`, no bulk frames. A drain that times out with 0 frames means "no new data".
- The `0x50` end frame was byte-identical in both drains: `50 00 00` plus 6-byte entries
  `<type> <flag> <timestamp:4>` at 02:43, 02:48, 02:49, 02:55, 03:37 and 03:43 that night and
  17:36 the next day, plus one `17 05 39 05 3b 00` entry. Probably an event or sleep-episode log
  (type `15`; flags `21`, `12`, `31`). Meaning not decoded.

## Not yet confirmed
- **Awake channel (0x03):** three drains over two sessions returned no bulk frames, even after
  a 30 s wait. Either the vendor app already drained it, or it needs something else.
- Meaning of the `0x50` event entries, and whether they are sleep stages.
- Why the newest record was about 4 h old at sync time (data up to 17:57, sync at 22:01).
- Skin temperature encoding, SpO2 and HRV values against the vendor app.

## Privacy
Do not commit the ring's MAC, System ID or captured frames that contain it.
