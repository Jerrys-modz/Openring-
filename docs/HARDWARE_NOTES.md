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

## Not yet confirmed
- History drain: frame flow, whether bulk frames are fragmented across notifications, and
  how a `0x4c` page splits into 23-byte records. The "Sync history" button logs every raw
  frame so this can be pinned down.
- **Record counter to time mapping.** The decoder treats the 3-byte counter as seconds in
  cursor space, but a 24-bit value cannot hold seconds since 2019-12-31 (about 2.1e8 now;
  24 bits tops out at 1.7e7). It is probably a count of 150 s steps. The history summary
  logs the counter range next to the cursor that was sent so this can be checked.
- Skin temperature encoding, SpO2 and HRV values against the vendor app.

## Privacy
Do not commit the ring's MAC, System ID or captured frames that contain it.
