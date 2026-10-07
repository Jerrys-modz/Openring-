import type { HrSample, StepSample } from './mapping';

// Loaded lazily so tests, the web and builds without the native module fail soft instead of crashing.
type HealthKit = typeof import('@kingstinct/react-native-healthkit');
function load(): HealthKit | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@kingstinct/react-native-healthkit') as HealthKit;
  } catch {
    return null;
  }
}

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate' as const;
const STEP_COUNT = 'HKQuantityTypeIdentifierStepCount' as const;

export type HealthAccess = 'unavailable' | 'not-asked' | 'denied' | 'allowed';

/** Whether the app may save heart rate to Apple Health. */
export async function healthAccess(): Promise<HealthAccess> {
  const hk = load();
  if (!hk) return 'unavailable';
  try {
    if (!(await hk.isHealthDataAvailableAsync())) return 'unavailable';
    const s = hk.authorizationStatusFor(HEART_RATE);
    if (s === hk.AuthorizationStatus.sharingAuthorized) return 'allowed';
    return s === hk.AuthorizationStatus.sharingDenied ? 'denied' : 'not-asked';
  } catch {
    return 'unavailable';
  }
}

/** Shows the system permission sheet once for both types; iOS ignores repeat requests. */
export async function requestHealthAccess(): Promise<HealthAccess> {
  const hk = load();
  if (!hk) return 'unavailable';
  await hk.requestAuthorization({ toShare: [HEART_RATE, STEP_COUNT] });
  return healthAccess();
}

// HealthKit drops a sample with the same sync identifier and a version that is not higher, so a
// repeated write cannot create a duplicate even if the local ledger is lost.
const syncMetadata = (identifier: string, version: number) =>
  ({ HKSyncIdentifier: `openring.${identifier}`, HKSyncVersion: version }) as never;

/** Saves in order and stops at the first failure. `onSaved` runs after each success. */
export async function saveHeartRate(samples: HrSample[], onSaved: (s: HrSample) => void): Promise<void> {
  const hk = load();
  if (!hk) throw new Error('Apple Health is not available in this build');
  for (const s of samples) {
    const at = new Date(s.unixSeconds * 1000);
    await hk.saveQuantitySample(HEART_RATE, 'count/min', s.bpm, at, at, syncMetadata(s.key, 1));
    onSaved(s);
  }
}

export async function saveSteps(sample: StepSample): Promise<void> {
  const hk = load();
  if (!hk) throw new Error('Apple Health is not available in this build');
  await hk.saveQuantitySample(
    STEP_COUNT,
    'count',
    sample.steps,
    new Date(sample.startUnix * 1000),
    new Date(sample.endUnix * 1000),
    // Same quarter-hour, larger count: the higher version replaces the earlier partial value.
    syncMetadata(sample.key.split(':').slice(0, 2).join(':'), sample.steps),
  );
}
