import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

type Context = Pick<ExtensionContext, 'model' | 'sessionManager'>;

/** Pi persists cache_warm usage only after success. Its timestamp is completion time, not cache-write time. */
export class CacheWarmObservation {
  written: number | undefined;
  private scope: string | undefined;
  private pending: { cursor: string | null; started: number } | undefined;

  reset(): void {
    this.written = undefined;
    this.scope = undefined;
    this.pending = undefined;
  }

  record(at: number | undefined): void {
    if (at !== undefined && (this.written === undefined || at > this.written)) this.written = at;
  }

  /** The decision precedes the request, so it is a conservative TTL origin once success is confirmed. */
  begin(ctx: Context, now = Date.now()): void {
    this.observe(ctx);
    this.pending = ctx.model ? {
      cursor: ctx.sessionManager.getLeafId(),
      started: now,
    } : undefined;
  }

  /** Walk only entries appended since the previous observation, never copy the session's whole history. */
  observe(ctx: Context): number | undefined {
    const scope = JSON.stringify([ctx.sessionManager.getSessionId(), ctx.model?.provider, ctx.model?.id]);
    if (scope !== this.scope) {
      this.reset();
      this.scope = scope;
    }
    const pending = this.pending;
    if (!pending) return undefined;
    const leaf = ctx.sessionManager.getLeafId();
    let cursor = leaf;
    let succeeded = false;
    while (cursor !== pending.cursor) {
      const entry = cursor === null ? undefined : ctx.sessionManager.getEntry(cursor);
      // The observed leaf is no longer an ancestor: a branch change cannot confirm this request.
      if (!entry) {
        this.reset();
        return undefined;
      }
      // Pi serializes warms and discards stale runs before appending usage. Reported model/provider may resolve aliases.
      if (entry.type === 'usage' && entry.kind === 'cache_warm') succeeded = true;
      cursor = entry.parentId;
    }
    pending.cursor = leaf;
    if (!succeeded) return undefined;
    this.pending = undefined;
    this.record(pending.started);
    return pending.started;
  }
}
