import { File, Paths } from 'expo-file-system';
import { ActivityRecord, parseBulkActivityRecord } from '../protocol';
import { RecordIndex } from './recordIndex';

/**
 * Append-only local copy of everything the ring sends during a history drain.
 *
 * The ring keeps its own resume pointer and does not resend records once they are ACKed (a second
 * drain returned only the records after the first), so every frame must be on disk before it is
 * ACKed. One JSON object per line: `{ t, hex }` with the receive time and the raw frame.
 */
const file = new File(Paths.document, 'ring-history.jsonl');

export function saveHistoryFrame(frame: Uint8Array): void {
  if (!file.exists) file.create();
  const hex = Array.from(frame, (b) => b.toString(16).padStart(2, '0')).join('');
  file.write(`${JSON.stringify({ t: Date.now(), hex })}\n`, { append: true });
}

export function readHistoryLines(): string[] {
  return file.exists ? file.textSync().split('\n').filter(Boolean) : [];
}

const recordFile = new File(Paths.document, 'ring-records.jsonl');

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));

/** Decoded records saved so far (one `{ raw }` line each; re-decoded on load). */
export function loadRecordIndex(): RecordIndex {
  const index = new RecordIndex();
  if (!recordFile.exists) return index;
  for (const line of recordFile.textSync().split('\n')) {
    if (!line) continue;
    try {
      const rec = parseBulkActivityRecord(hexToBytes((JSON.parse(line) as { raw: string }).raw));
      if (rec) index.add(rec);
    } catch {
      // skip a damaged line; the raw frame log still has the data
    }
  }
  return index;
}

/** Throws on failure so the drain stops before ACKing. */
export function appendRecord(r: ActivityRecord): void {
  if (!recordFile.exists) recordFile.create();
  recordFile.write(`${JSON.stringify({ raw: r.rawHex })}\n`, { append: true });
}
