import { File, Paths } from 'expo-file-system';

/** Keys of everything already saved to Apple Health, one per line. Append-only. */
const ledger = new File(Paths.document, 'health-written.txt');

export function loadWritten(): Set<string> {
  return new Set(ledger.exists ? ledger.textSync().split('\n').filter(Boolean) : []);
}

export function markWritten(keys: string[]): void {
  if (!keys.length) return;
  if (!ledger.exists) ledger.create();
  ledger.write(`${keys.join('\n')}\n`, { append: true });
}

export interface Settings {
  healthHeartRate: boolean;
  /** Beta: steps are only seen while connected, so it is off until the user opts in. */
  healthSteps: boolean;
}

const DEFAULTS: Settings = { healthHeartRate: true, healthSteps: false };
const settingsFile = new File(Paths.document, 'settings.json');

export function loadSettings(): Settings {
  try {
    return settingsFile.exists ? { ...DEFAULTS, ...(JSON.parse(settingsFile.textSync()) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings): void {
  if (!settingsFile.exists) settingsFile.create();
  settingsFile.write(JSON.stringify(s), {});
}
