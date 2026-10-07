import type { ActivityRecord } from '../protocol';

export interface HrSummary {
  /** Records with a valid heart rate. */
  count: number;
  min: number | null;
  avg: number | null;
  max: number | null;
  /** Ring-clock seconds of the first and last record (any kind), null when empty. */
  first: number | null;
  last: number | null;
}

export function summarizeHeartRate(records: ActivityRecord[]): HrSummary {
  let count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let first: number | null = null;
  let last: number | null = null;
  for (const r of records) {
    first = first === null ? r.ringClockSeconds : Math.min(first, r.ringClockSeconds);
    last = last === null ? r.ringClockSeconds : Math.max(last, r.ringClockSeconds);
    if (r.heartRate === null) continue;
    count++;
    sum += r.heartRate;
    min = Math.min(min, r.heartRate);
    max = Math.max(max, r.heartRate);
  }
  return {
    count,
    min: count ? min : null,
    avg: count ? Math.round(sum / count) : null,
    max: count ? max : null,
    first,
    last,
  };
}

export interface HrBucket {
  /** Ring-clock seconds at the start of the bucket. */
  start: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  n: number;
}

/**
 * Average heart rate per time bucket over the window [end - bucketSeconds * bucketCount, end).
 * `endSeconds` defaults to just after the newest record, so that record is included. Buckets with
 * no heart-rate samples have `avg: null`.
 */
export function bucketHeartRate(
  records: ActivityRecord[],
  bucketSeconds: number,
  bucketCount: number,
  endSeconds?: number,
): HrBucket[] {
  const end = endSeconds ?? records.reduce((m, r) => Math.max(m, r.ringClockSeconds), 0) + 1;
  const start = end - bucketSeconds * bucketCount;
  const sums = Array.from({ length: bucketCount }, () => ({ sum: 0, n: 0, min: Infinity, max: -Infinity }));
  for (const r of records) {
    if (r.heartRate === null || r.ringClockSeconds < start || r.ringClockSeconds >= end) continue;
    const b = sums[Math.floor((r.ringClockSeconds - start) / bucketSeconds)];
    if (!b) continue;
    b.sum += r.heartRate;
    b.n++;
    b.min = Math.min(b.min, r.heartRate);
    b.max = Math.max(b.max, r.heartRate);
  }
  return sums.map((b, i) => ({
    start: start + i * bucketSeconds,
    avg: b.n ? Math.round(b.sum / b.n) : null,
    min: b.n ? b.min : null,
    max: b.n ? b.max : null,
    n: b.n,
  }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Ring-clock seconds are already local wall time, so read them with the UTC getters. */
const ringDate = (s: number): Date => new Date(s * 1000);

/** `6:14 AM` */
export function formatRingClock(s: number): string {
  const d = ringDate(s);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** `Wed Oct 7` */
export function formatRingDay(s: number): string {
  const d = ringDate(s);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
