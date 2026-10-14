import { redactSecrets } from './sanitize.js';

/** The thinking text kept while it streams: enough to hold its latest sentences. */
const THOUGHT_TAIL = 2_000;

/**
 * The gist of thinking text: its last finished sentence or heading. While the text still streams (`complete` false), a
 * sentence counts once text follows it, so a live line changes per thought, not per token; undefined until one does.
 */
export function thoughtGist(text: string, complete = false): string | undefined {
  const units = text.replace(/\*\*|__|`/g, '').split(/\n+|(?<=[.!?])\s+/).map((unit) => unit.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const finished = complete || /[.!?:]\s*$|\n\s*$/.test(text);
  const gist = finished ? units.at(-1) : units.at(-2);
  // Shown on screen and stored in the shared team database, like a tool hint.
  return gist && redactSecrets(gist.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, '$1'));
}

/** A streaming thinking block, reduced to its gist (see `thoughtGist`). */
export class Thought {
  private text = '';
  gist: string | undefined;

  reset(): void {
    this.text = '';
    this.gist = undefined;
  }

  /** Adds a delta; true when the gist changed. A sentence still streaming keeps the last finished one shown. */
  add(delta: string): boolean {
    const text = this.text + delta;
    // Past the tail, drop the cut unit at the front too: a secret cut there loses the prefix redaction matches on.
    this.text = text.length > THOUGHT_TAIL ? afterFirstBoundary(text.slice(-THOUGHT_TAIL)) : text;
    const gist = thoughtGist(this.text);
    if (gist === undefined || gist === this.gist) return false;
    this.gist = gist;
    return true;
  }
}

/** `text` after its first line break or sentence end; empty when it has none. */
function afterFirstBoundary(text: string): string {
  const at = text.search(/\n|[.!?]\s/);
  return at < 0 ? '' : text.slice(at + 1);
}
