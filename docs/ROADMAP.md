# Roadmap: match, then beat, the stock RingConn app

Status key: ✅ verified on a ring · 🟡 written, unverified · ⬜ not started · ❓ needs reverse engineering.

The "stock app" column is my assumption of what the RingConn app offers (sleep, readiness,
vitals, activity, firmware). Check it against the real app before committing to scope.

## Principles
- Local-first: no account, no cloud, no analytics. Data goes ring -> phone -> Apple Health.
- Honest data: label estimates as estimates (sleep stages, readiness). Never invent ring-native values.
- One owner of the ring connection at a time. Document the "close the vendor app first" rule in-app.
- Personal, non-commercial use only (protocol sources are PolyForm Noncommercial).

## Phase A: Reliable data in (finish the plumbing)
| # | Item | Status |
|---|------|--------|
| A1 | Scan, connect, authenticate | ✅ |
| A2 | Live heart rate | ✅ |
| A3 | History drain, with ACK and end marker (sleep channel works; awake channel always empty so far) | ✅ sleep / ❓ awake |
| A4 | Record layout and time mapping: 4-byte timestamp, 150 s apart, device-local clock | ✅ activity records; ❓ sleep-vitals records need an overnight drain |
| A5 | Status panel: battery, voltage, mode, steps bucket, skin temp (decoder checked against real frames) | 🟡 in the app, needs a device check |
| A6 | Local store of raw frames and decoded records, deduped by timestamp, CSV export | 🟡 file-based (JSONL); SQLite later if needed |
| A7 | Debug screen: raw frames, export log (strip MAC) | 🟡 log only |

Exit criterion: a 24 h drain produces plausible, time-correct heart rate and sleep records that match the stock app within a few percent.

## Phase B: Apple Health and Sparky (the main win)
| # | Item | Status |
|---|------|--------|
| B1 | HealthKit permissions and capability (`@kingstinct/react-native-healthkit`) | 🟡 written, needs a device test |
| B2 | Write heart rate (🟡 written) and steps (🟡 beta, live only); resting HR, SpO2, respiratory rate, skin temperature still to do | 🟡 |
| B3 | Idempotent writes: local ledger plus HealthKit sync identifiers | 🟡 |
| B4 | Sleep analysis samples (in bed / asleep), stages labelled as estimated | ⬜ |
| B5 | HRV: write as SDNN only if clearly labelled; the ring reports RMSSD | ⬜ |
| B6 | Verify end to end: ring -> Health -> SparkyFitness | ⬜ |

Beats stock: stock app does not feed your own tooling; this does.

## Phase C: Parity with the stock app's features
| # | Feature | Notes |
|---|---------|-------|
| C1 | Daily dashboard: HR, steps, SpO2, temp, battery | Straightforward once A6 exists |
| C2 | Sleep view: duration, timeline, HR/HRV/SpO2 overnight | Stages are our own estimate unless the ring exposes them |
| C3 | Sleep score and readiness | Algorithm choice is ours; document the formula, do not claim to equal the vendor's |
| C4 | Resting HR and HRV baselines, trend charts (7/30/90 days) | Pure local analytics |
| C5 | Stress / recovery indicator | Derived from HRV and HR; label as estimate |
| C6 | Activity and calories | Steps bucket is available; calories need a model, flag as estimate |
| C7 | Workout detection or manual workouts into HealthKit | ❓ depends on what the ring records |
| C8 | Battery and charging status, low-battery notice | Descriptor already has the fields |
| C9 | Notifications: "sync done", "ring battery low" | Local notifications only |

## Phase D: Background sync and polish
| # | Item | Status |
|---|------|--------|
| D1 | BLE state restoration and background reconnect | ⬜ riskiest item on iOS |
| D2 | `BGTaskScheduler` sync, plus "sync after sleep" trigger | ⬜ |
| D3 | Handle ring clock drift and DST | ❓ |
| D4 | Multiple rings or ring replacement (new MAC) | ⬜ |
| D5 | App icon, onboarding, permission explanations, error states | ⬜ |
| D6 | Release gate: no health data or MAC in logs in release builds | ⬜ |

## Phase E: Beat the stock app
Things the vendor app does not do, or does not let you do:
- **Open data:** export CSV/JSON of every raw record; keep full-resolution history instead of daily summaries.
- **Custom analytics:** correlate sleep, HRV and resting HR with your own Sparky nutrition and training data.
- **Smarter alerts:** user-defined rules (for example resting HR 5 bpm above baseline for 3 days).
- **Higher-fidelity live view:** continuous HR with history graph and a workout mode.
- **Privacy:** nothing leaves the phone; optionally encrypted local backups.
- **Automation:** Shortcuts / App Intents hooks ("sync ring now").
- **Ring settings the vendor app hides** ❓: only if they turn up in the protocol; do not guess at write commands that could harm the ring.

## Things we may not be able to match
- Firmware updates (needs the vendor's firmware files and signing; out of scope).
- Vendor-trained sleep staging and readiness models.
- Official support and warranty guarantees; a firmware update can break us at any time.
- Cloud features and account sync.

## Suggested order
1. Finish A3-A5 with the current build's "Sync history" log, then A6.
2. B1-B3 (heart rate and steps first), then B6 to prove the Sparky path.
3. C1, C2, C4, C8.
4. D1-D2 background sync. Do this early enough to find out how well iOS allows it.
5. C3, C5, C6, then Phase E extras.

## Decisions for Jerry
- Is the goal "ring data in Sparky" (Phases A, B, D) or a full replacement app (add C and E)?
- Do you want sleep and readiness scores at all, or just the raw data in Health?
- Android later, or iOS only?

## Maintenance
- **Expo SDK 58:** SDK 57 is the current stable release. SDK 58 is only a pre-release (React Native 0.88
  release candidate); a trial in October 2026 failed (`jest-expo` 58 wants a React Native Jest preset
  release candidate that npm does not resolve, and its tests crash) and cleared none of the audit
  findings. Upgrade once SDK 58 is tagged `latest`, moving Expo, React Native, `jest-expo` and Jest 30
  together. Dependabot skips npm major versions, so this will not be proposed automatically.
