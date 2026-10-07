# openring

Local-first sync for RingConn smart rings: read the ring over Bluetooth LE from an
Expo / React Native app and write the data to Apple Health, so it flows into
SparkyFitness (or anything else that reads HealthKit). No RingConn account or cloud.

Status: **milestone 2 verified on a RingConn Gen 2** (connect, auth, live heart rate);
milestone 3 (history drain) is written but unverified. See `docs/HARDWARE_NOTES.md`.

The code is a protocol core (`src/protocol/`,
pure TypeScript, unit-tested) plus an Expo dev-client app that scans, reads the MAC,
authenticates, shows live heart rate and can attempt a history drain. See `docs/PLAN.md`.

## Run it on an iPhone (no Mac needed, paid Apple Developer account required)
```bash
npm install
npm i -g eas-cli && eas login
eas device:create                 # register your iPhone (open the link on the phone)
eas build --profile development --platform ios
# install the build from the QR/link on the phone, enable Developer Mode, then:
npm start                         # expo start --dev-client
```
Change `ios.bundleIdentifier` in `app.config.ts` first. Take the ring off the charger and
close the RingConn app (the ring accepts one connection). The first connection triggers a
system pairing prompt. The on-screen log shows every frame, and the System ID, so please
share it if authentication fails: the System ID -> MAC byte order is the main unknown, so
the client tries several candidates (or paste a MAC override). On a Gen 2 ring the
System ID is the 6-byte MAC as-is.

## CI
`.github/workflows/ci.yml` runs on every push/PR: typecheck, unit tests, Expo config and SDK
dependency check, and an iOS prebuild that verifies the Bluetooth permission and background
mode. `eas-build.yml` is a manual cloud build (+ optional TestFlight submit); it needs an
`EXPO_TOKEN` repo secret. Dependabot is enabled for npm and Actions.

## TestFlight
See `docs/TESTFLIGHT.md` for internal testing (EAS build + submit, no Mac needed).



## What exists
- `src/ble/RingClient.ts` — scan, connect, auth (tries MAC candidates), live HR polling
- `App.tsx` — minimal screen: Connect, live bpm, frame log
- `sysid.ts` — System ID (0x2A23) to MAC candidates
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
The MAC format of the System ID is now confirmed (see `docs/HARDWARE_NOTES.md`). The byte layouts come from public reverse-engineering notes (Gen 2 documentation; Gen 3
reportedly shares the service). Things to confirm on a real ring: the MAC format of the
Device Info System ID, whether the bulk-record counter maps to time exactly as assumed,
skin-temperature field encoding, and how bulk pages split into 23-byte records.

## Roadmap
1. ~~Protocol core + tests~~
2. ~~Expo dev-client app: scan, connect, read MAC, authenticate, live HR~~ (verified on hardware)
3. History drain over both channels ("Sync history" button written, needs a ring test)
4. HealthKit writes with dedupe
5. Sleep stages, resting HR
6. Background sync

## Licence and credits
Protocol knowledge comes from the OpenCircuit project's documentation
(PolyForm Noncommercial 1.0.0) and RingLink (MIT). Because this is derived from
noncommercial-licensed material, treat it as personal, non-commercial use only. No
licence has been chosen for this repository yet.
Not affiliated with RingConn. Unofficial; firmware updates may break it.
