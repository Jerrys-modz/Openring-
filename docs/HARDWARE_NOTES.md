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
- `0x4c` frame layout: `4c <remaining:2 BE> <record:23>... <xor>`; the XOR trailer is present (a
  4-record frame is 96 bytes, and XOR of the first 95 bytes equals the last).
  The header counts the records still to come and reaches 0 on the last page (also true for `0x47`
  frames, in steps of 5). It can contain `0x0c`, so never scan for a marker byte.
- **Record timestamp:** the first 4 bytes of each record are a big-endian count of seconds since
  2019-12-31 12:00 UTC, the same space as the cursor. The leading `0x0c` is the high byte, not a
  marker: it turns into `0x0d` around 2026-11-28, so never match on it. Consecutive records are
  150 s apart. Pages arrive oldest first, countdown to 0.
- **Record time is device-local, the cursor is UTC.** The newest record was always ~4 min before
  the sync, but showed 4 h early when read as UTC in US Eastern time (UTC-4): two syncs, 22:01 vs
  last record 17:57, and 06:25 vs 02:21 as displayed. The ring writes local wall-clock time into
  the record timestamp (OpenCircuit `PROTOCOL.md` also notes it lands on device-local time). Use
  `recordUnixSeconds(record, utcOffsetMinutes)`. The sync-open cursor is a true UTC time and works
  as `now - epoch`.
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
  `[type][value][timestamp:4]`. This is the ring's **event log** (OpenCircuit `PROTOCOL.md` §5.5.1):
  the ring re-sends the same window on every drain. Ours: `15/21` 02:43, `15/12` 02:48, `15/31`
  02:49, `15/12` 02:55, `15/21` 03:37, `15/12` 03:43 and `15/21` 17:36 the next day, plus one
  `17 05 39 05 3b 00` entry (type `17` cursors land years away; undecoded upstream too). Per
  OpenCircuit, `15` entries are mode transitions: `31` is charging (matches a descriptor with
  mode 1) and `12` is the return to worn, so the ring may have been charged around 02:49.

## What OpenCircuit says (https://github.com/perezjuanj/OpenCircuit, `docs/PROTOCOL.md` §3, §5.5)
- One shared resume pointer: whoever opens at cursor ~ now first drains the backlog, and the
  official app and any other client compete for it. Be the only syncer.
- The official app opens at cursor ~ now on every sync; OpenRing now does the same (it used
  now minus 24 h, which also worked but is not what the app does).
- The ring buffers history for days (a first sync drained 19 days).
- `82 00 00 82` means pages will follow; `82 ff 00 7d` was seen on the all-day channel when the
  pointer was already at the end. Our empty channels answered `82 00 00 82` and then stayed
  silent, so this signal is not reliable on a Gen 2 ring.
- A channel can go quiet without a `0x50`. We now treat a finished page countdown plus 2 s of
  silence as the end.
- The `0x50` `to` cursor trails the last delivered record, so consecutive syncs can overlap
  slightly: dedupe by timestamp when storing.

## Not yet confirmed
- **Awake channel (0x03):** three drains over two sessions returned no bulk frames, even after
  a 30 s wait. Either the vendor app already drained it, or it needs something else.
- Meaning of the `0x50` event entries, and whether they are sleep stages.
- Which timezone the ring thinks it is in (we assume the phone's), and how DST changes show up.
- Where the night went: a sync at 06:25 returned only 4 records (06:14 to 06:21 ring time), none
  for the night. Possibly drained by the vendor app in between; otherwise on the awake channel.
- Skin temperature encoding, SpO2 and HRV values against the vendor app.

## Privacy
Do not commit the ring's MAC, System ID or captured frames that contain it.
