import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { isStaleSessionError } from '../shared/util.js';

/**
 * Compaction decisions a user sees only as a notice, kept in the session so the history shows them later: which
 * summary Pi wrote when Octocode's did not run, why an automatic compaction was refused, and why a model switch
 * compacted first. A custom session entry is never sent to the model. (A summary Octocode wrote names its own method
 * and any fallback reason in the compaction entry's `details`, `summary.ts`.)
 */

/** The session entry type of a compaction note; `data` is `{ kind, reason }`. */
export const COMPACTION_NOTE_TYPE = 'octocode-compaction-note';

type CompactionNoteKind =
  /** Octocode's summary failed or could not start, so Pi wrote its default summary. */
  | 'default-summary'
  /** The thrash breaker refused an automatic compaction. */
  | 'thrash-stop'
  /** A model switch to a smaller window compacted first, on the previous model. */
  | 'downshift'
  /** The compaction succeeded but its messages could not be archived. */
  | 'archive-failed';

/** Appends a compaction note to the session; a session replaced meanwhile (a stale `pi`) records nothing. */
export function recordCompactionNote(pi: Pick<ExtensionAPI, 'appendEntry'>, kind: CompactionNoteKind, reason: string): void {
  try {
    pi.appendEntry(COMPACTION_NOTE_TYPE, { kind, reason });
  } catch (error) {
    if (!isStaleSessionError(error)) throw error;
  }
}
