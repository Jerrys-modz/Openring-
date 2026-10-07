import type { ActivityRecord } from '../protocol';

/** In-memory set of decoded history records, keyed by ring timestamp so repeated syncs never duplicate. */
export class RecordIndex {
  private readonly byTimestamp = new Map<number, ActivityRecord>();
  /** Same timestamp seen again with different bytes. First copy wins; this counts the disagreements. */
  conflicts = 0;

  has(timestamp: number): boolean {
    return this.byTimestamp.has(timestamp);
  }

  /** Returns true if the record was new. */
  add(r: ActivityRecord): boolean {
    const old = this.byTimestamp.get(r.timestamp);
    if (old) {
      if (old.rawHex !== r.rawHex) this.conflicts++;
      return false;
    }
    this.byTimestamp.set(r.timestamp, r);
    return true;
  }

  get size(): number {
    return this.byTimestamp.size;
  }

  sorted(): ActivityRecord[] {
    return [...this.byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
  }

  range(): { first: ActivityRecord; last: ActivityRecord } | null {
    const all = this.sorted();
    return all.length ? { first: all[0] as ActivityRecord, last: all[all.length - 1] as ActivityRecord } : null;
  }
}

const cell = (v: number | null): string => (v === null ? '' : String(v));

/** One row per record, oldest first. `ring_time` is the ring's own local clock reading. */
export function recordsToCsv(records: ActivityRecord[]): string {
  const rows = records.map((r) => [
    new Date(r.ringClockSeconds * 1000).toISOString().slice(0, 19).replace('T', ' '),
    r.kind,
    cell(r.heartRate),
    cell(r.hrvRmssdMs),
    cell(r.respiratoryRate),
    cell(r.spo2),
    r.signalQuality,
    r.rawHex,
  ].join(','));
  return ['ring_time,kind,hr_bpm,hrv_rmssd_ms,resp_rate,spo2,quality,raw', ...rows].join('\n');
}
