import { ActivityRecord, recordUnixSeconds } from '../protocol';

export interface HrSample {
  /** Ledger key, unique per ring timestamp. */
  key: string;
  bpm: number;
  unixSeconds: number;
}

export const hrKey = (timestamp: number): string => `hr:${timestamp}`;

/** Heart-rate records that have not been saved to Health yet, oldest first. */
export function pendingHeartRate(
  records: ActivityRecord[],
  written: ReadonlySet<string>,
  utcOffsetMinutes: number,
): HrSample[] {
  const out: HrSample[] = [];
  for (const r of records) {
    const key = hrKey(r.timestamp);
    if (r.heartRate === null || written.has(key)) continue;
    out.push({ key, bpm: r.heartRate, unixSeconds: recordUnixSeconds(r, utcOffsetMinutes) });
  }
  return out;
}

const QUARTER_SECONDS = 15 * 60;

export interface StepSample {
  /** Ledger key: quarter-hour plus the step count, so a larger later value is written again. */
  key: string;
  steps: number;
  startUnix: number;
  endUnix: number;
}

/**
 * The ring reports steps for the current quarter-hour only and clears the number at :00, :15, :30
 * and :45. This keeps the largest value seen in each quarter and hands back the finished quarter
 * when the next one starts. It only sees quarters while the app is connected, so steps taken while
 * disconnected are never recorded.
 */
export class StepTracker {
  private quarter: number | null = null;
  private max = 0;

  constructor(private readonly utcOffsetMinutes: number) {}

  private sample(): StepSample | null {
    if (this.quarter === null || this.max <= 0) return null;
    const startUnix = this.quarter * QUARTER_SECONDS - this.utcOffsetMinutes * 60;
    return {
      key: `steps:${this.quarter}:${this.max}`,
      steps: this.max,
      startUnix,
      endUnix: startUnix + QUARTER_SECONDS,
    };
  }

  /** Feed one status reading. Returns the previous quarter-hour when this reading starts a new one. */
  observe(steps: number, nowUnix: number): StepSample | null {
    const q = Math.floor((nowUnix + this.utcOffsetMinutes * 60) / QUARTER_SECONDS);
    if (this.quarter === q) {
      this.max = Math.max(this.max, steps);
      return null;
    }
    const finished = this.sample();
    this.quarter = q;
    this.max = steps;
    return finished;
  }

  /** The quarter-hour so far, for flushing on disconnect. */
  peek(): StepSample | null {
    return this.sample();
  }
}
