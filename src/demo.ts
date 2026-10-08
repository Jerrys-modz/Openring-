import { File, Paths } from 'expo-file-system';
import { ActivityRecord, parseBulkActivityRecord } from './protocol';

export type TabName = 'today' | 'history' | 'health' | 'log';

/**
 * CI screenshots: a `demo-mode` file in the app's documents folder fills the app with sample
 * values (a simulator has no ring and no Bluetooth). Its text picks the tab to show. Cosmetic
 * only: nothing is stored or sent. Returns null when the file is absent.
 */
export function readDemoTab(): { tab: TabName; healthSetup: boolean } | null {
  try {
    const f = new File(Paths.document, 'demo-mode');
    if (!f.exists) return null;
    const t = f.textSync().trim();
    // `health-setup` shows the Health tab before access has been granted.
    if (t === 'health-setup') return { tab: 'health', healthSetup: true };
    return { tab: t === 'history' || t === 'health' || t === 'log' ? t : 'today', healthSetup: false };
  } catch {
    return null;
  }
}

// Ring-clock timestamp of the last sample in the real overnight frame: 2026-10-07 06:21:42.
const DEMO_END = 0x0cbaacb6;

/** 24 hours of 150 s samples with a plausible day shape and a few gaps, deterministic. */
export function demoRecords(): ActivityRecord[] {
  const out: ActivityRecord[] = [];
  for (let i = 0; i < 576; i++) {
    if (i % 97 < 4) continue; // ring off the wrist
    const ts = DEMO_END - i * 150;
    const hourOfDay = (((ts + 1577793600) % 86400) / 3600 + 24) % 24;
    const base = hourOfDay < 6 ? 54 : hourOfDay < 9 ? 68 : hourOfDay < 18 ? 76 : 66;
    const wobble = Math.sin(i / 7) * 5 + ((i * 2654435761) % 11) - 5;
    const hr = Math.round(base + wobble + (i % 53 === 0 ? 28 : 0));
    const r = new Uint8Array(23);
    r[0] = (ts >>> 24) & 0xff;
    r[1] = (ts >>> 16) & 0xff;
    r[2] = (ts >>> 8) & 0xff;
    r[3] = ts & 0xff;
    r[4] = hr;
    r[6] = 3;
    r[7] = 122 + (i % 6); // respiratory rate x8, about 15 to 16 breaths per minute
    r[5] = 40 + (i % 25); // HRV (RMSSD, ms)
    // About one record in four carries a SpO2 spot check, like the real ring.
    r[8] = i % 4 === 1 ? 96 + (i % 4) + (i % 3) : 0x12;
    const rec = parseBulkActivityRecord(r);
    if (rec) out.push(rec);
  }
  return out.reverse();
}
