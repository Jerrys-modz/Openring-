# openring

Local-first sync for RingConn smart rings: read the ring over Bluetooth LE from an
Expo / React Native app and write the data to Apple Health, so it flows into
SparkyFitness (or anything else that reads HealthKit). No RingConn account or cloud.

Status: **milestone 1 done** — the protocol core (`src/protocol/`) is pure TypeScript with
no dependencies and is unit-tested. There is no app or BLE code yet; see `docs/PLAN.md`.

## What exists
- `sm3.ts` — SM3 hash (GB/T 32905), checked against the standard vectors and OpenSSL
- `frames.ts` — command building, XOR-checked response parsing, auth handshake, history cursor
- `records.ts` — decoders for bulk activity/sleep records, status descriptor, live HR, end-of-history
- `constants.ts` — GATT UUIDs, opcodes, channels

```bash
npm install
npm test
npm run typecheck
```

## Not yet verified on hardware
The byte layouts come from public reverse-engineering notes (Gen 2 documentation; Gen 3
reportedly shares the service). Things to confirm on a real ring: the MAC format of the
Device Info System ID, whether the bulk-record counter maps to time exactly as assumed,
skin-temperature field encoding, and how bulk pages split into 23-byte records.

## Roadmap
1. ~~Protocol core + tests~~
2. Expo dev-client app: scan, connect, read MAC, authenticate, live HR
3. History drain over both channels
4. HealthKit writes with dedupe
5. Sleep stages, resting HR
6. Background sync

## Licence and credits
Protocol knowledge comes from the OpenCircuit project's documentation
(PolyForm Noncommercial 1.0.0) and RingLink (MIT). Because this is derived from
noncommercial-licensed material, treat it as personal, non-commercial use only. No
licence has been chosen for this repository yet.
Not affiliated with RingConn. Unofficial; firmware updates may break it.
