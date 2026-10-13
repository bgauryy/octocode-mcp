import type { Api, Model } from '@earendil-works/pi-ai';

/**
 * When compaction runs, beyond Pi's threshold: a breaker for compactions that keep refilling the context, and a
 * compaction before a switch to a model whose window the context does not fit.
 */

/** A compaction this few turns after the previous one counts as a refill... */
export const THRASH_TURNS = 3;
/** ...and this many refills in a row stop automatic compaction (Claude Code's thrash breaker). */
export const THRASH_STREAK = 3;

/** Counts compactions that came right after the previous one. */
export class ThrashBreaker {
  #turnsSince: number | undefined;
  #streak = 0;

  reset(): void {
    this.#turnsSince = undefined;
    this.#streak = 0;
  }

  turnEnded(): void {
    if (this.#turnsSince !== undefined) this.#turnsSince += 1;
  }

  /** Records a finished compaction; a manual one starts the count over. */
  compacted(manual: boolean): void {
    this.#streak = !manual && this.#turnsSince !== undefined && this.#turnsSince <= THRASH_TURNS ? this.#streak + 1 : 0;
    this.#turnsSince = 0;
  }

  /** Whether an automatic compaction now should be refused: the context refilled right away too many times. */
  tripped(): boolean {
    return this.#streak >= THRASH_STREAK && this.#turnsSince !== undefined && this.#turnsSince <= THRASH_TURNS;
  }
}

export const THRASH_MESSAGE =
  `Automatic compaction stopped: the context refilled to the limit within ${THRASH_TURNS} turns of the previous compaction, ` +
  `${THRASH_STREAK} times in a row, so another summary would not make room. Something keeps adding more than the summary ` +
  'frees (a large file read, tool output or attachment). Start a new session, or run /compact with a focus that drops it.';

/**
 * Whether switching from `previous` to `next` needs a compaction first: the context (`tokens`) does not fit the new
 * window less the room Pi keeps for a reply (`reserveTokens`), and the previous model could still read all of it.
 */
export function needsDownshiftCompaction(previous: Pick<Model<Api>, 'contextWindow'> | undefined, next: Pick<Model<Api>, 'contextWindow'>, tokens: number | null | undefined, reserveTokens: number): boolean {
  if (!previous || tokens === null || tokens === undefined || next.contextWindow <= 0) return false;
  return next.contextWindow < previous.contextWindow && tokens > next.contextWindow - reserveTokens;
}
