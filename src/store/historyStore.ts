import { File, Paths } from 'expo-file-system';

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
