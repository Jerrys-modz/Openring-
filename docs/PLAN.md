# RingConn → HealthKit: Expo (React Native) port plan

Source of truth: OpenCircuit `docs/PROTOCOL.md` and `docs/HEALTHKIT_MAPPING.md`
(PolyForm Noncommercial 1.0.0). A port is a derivative work: keep it a personal,
non-commercial, separate project, and do NOT merge it into SparkyFitness.
Goal: ring --BLE--> Expo app --HealthKit--> Apple Health --> Sparky mobile (existing sync).

## 1. Stack
- Expo (current SDK) + custom dev client (`expo-dev-client`); Expo Go cannot do BLE/HealthKit.
- BLE: `react-native-ble-plx` (state restoration on iOS via `restoreStateIdentifier`).
- Hash: SM3 (GB/T 32905). No ubiquitous RN lib; implement ~80 lines in TS or use `sm-crypto`
  (verify output against known vectors; "abc" -> 66c7f0f4...).
- HealthKit: `@kingstinct/react-native-healthkit` (supports quantity, category, workout writes).
- Builds: EAS Build (no Mac needed) or local Xcode. Device install needs an Apple ID
  (free = 7-day expiry; paid = 1 year).
- Background: UIBackgroundModes `bluetooth-central`, `processing`, `fetch`; BGTaskScheduler
  via `expo-background-task`. Real-world iOS background BLE is the riskiest part.

## 2. Protocol facts (from PROTOCOL.md, Gen 2; RingLink indicates Gen 3 shares service UUID)
GATT
- Service  `8327ad99-2d87-4a22-a8ce-6dd7971c0437`
- Write    `8327ad98-...`   Notify `8327ad97-...` (enable CCCD)
- Device Info 0x180A; System ID `0x2A23` holds the ring MAC (iOS hides the real MAC otherwise)
- Pairing: LE Secure Connections "Just Works", one-time; scan by name prefix "RingConn"

Auth (every connection)
1. Ring sends `81 00 <challenge> <xor>`
2. `V = mac[3]^mac[4]^mac[5]`; `resp = SM3([V, challenge])[29:32]` (last 3 bytes)
3. Write `01 01 r0 r1 r2 00`

Framing
- Host->ring: `[op][sub][payload...][00]` (no checksum)
- Ring->host: `[op^0x80][payload...][xor of all prior bytes]`
- Bulk frames `0x47` / `0x4c`: records start `0x0c` + 3-byte BE counter; ACK with `c7 00 00` / `cc 00 00`

History sync
- Open: `02 00 <cursor:4 BE> <channel> 01 00`, cursor = unix - 1577793600
- Channels: `0x00` sleep/overnight, `0x03` awake/all-day. Drain both every sync.
- Fetch pages with `07 00 00`; `0x50` frame = end of history (no XOR trailer)
- Ring keeps its own resume pointer; app needn't persist a cursor (but dedupe writes anyway)

Records
- `0x4c` (23 B, 150 s step): HR[4], HRV rmssd[5], quality[6], RR*8[7], SpO2[8]
  (0x11/0x12/0x13 = no-SpO2 sentinels -> activity epoch), activity blob[10:20]
- `0x10`/`0x87` descriptor (19 B): battery[1], mode[2], steps[4:6] (quarter-hour bucket),
  skin temp 0.1C [6:8],[8:10], voltage[14:16], case battery[17]
- `0x47` PPG snapshots: skip (no heartbeat recoverable)
- Live HR: write `95 00 00` -> `15 00 <hr> 0a b0 <xor>`, poll >=2 s, ignore < ~30 bpm warm-up

## 3. HealthKit mapping (OpenCircuit)
HR -> heartRate | resting HR (derived from sleep) | HRV -> SDNN (value is RMSSD; tag metadata,
or consider skipping to avoid mislabeling) | SpO2 -> oxygenSaturation (0-1) |
skin temp -> bodyTemperature | RR -> respiratoryRate | steps -> stepCount (quarter-hour
buckets) | sleep stages -> sleepAnalysis (core/deep/REM are *locally estimated*, not ring-native).
Dedupe with a per-metric high-water mark in storage; writes must be idempotent.

## 4. Proposed module layout
```
src/protocol/sm3.ts        # hash + test vectors
src/protocol/frames.ts     # build/parse, xor check, opcodes
src/protocol/records.ts    # 0x4c / 0x10 / 0x15 decoders (pure, unit-tested)
src/ble/RingClient.ts      # scan, connect, auth, drain, ACK, restore
src/health/writer.ts       # HealthKit writes + high-water marks
src/sync/syncOnce.ts       # connect -> drain both channels -> write -> disconnect
src/ui/                    # pair, last-sync, manual sync, permissions
```

## 5. Milestones
1. Pure TS: SM3 + frame/record parsers with Jest tests (use captured hex from the repo docs).
2. Dev-client app: scan/connect/read System ID, complete auth handshake, show live HR.
3. History drain (both channels), decode to in-memory samples, view in a debug list.
4. HealthKit writes (HR, SpO2, steps, RR, temp) with dedupe; verify in Apple Health -> Sparky.
5. Sleep staging + resting HR derivation (optional; needs algorithm decisions).
6. Background sync (state restoration, BGTask) and "sync after sleep" trigger.

## 6. Risks / open questions
- Gen 3 differences vs documented Gen 2 (needs live testing; RingLink's docs/PROTOCOL.md helps).
- Firmware updates may change auth/framing; there is no official support.
- Real MAC is required for auth; confirm DIS 0x2A23 works on your ring generation.
- Don't run the vendor app and this client simultaneously (single connection, shared resume pointer).
- Licence: see header. Ask the author for a permissive grant before any public release.
- Health data is sensitive: never log samples or MAC in release builds.
