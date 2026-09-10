import type { PiContext } from '../../types.js';
import { configSignature, normalizeServerConfig, type McpServerConfig } from './config.js';

/** Compare current configuration against live connections, without side effects. */
export function computeReload(running: Map<string, string>, servers: Map<string, McpServerConfig>): { changed: string[]; removed: string[] } {
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [name, signature] of running) {
    const config = servers.get(name);
    if (!config) removed.push(name);
    else if (configSignature(normalizeServerConfig(name, config)) !== signature) changed.push(name);
  }
  return { changed, removed };
}

/** Coalesce invalidations; a replacement session clears ownership of old jobs. */
export function createCatalogRefreshQueue(options: {
  pending(key: string): Promise<void> | undefined;
  refresh(ctx?: PiContext): Promise<void>;
  onError(error: unknown): void;
  track(work: Promise<void>): void;
}) {
  const queued = new Map<string, Promise<void>>();
  return {
    clear: () => queued.clear(),
    schedule(key: string, ctx?: PiContext): void {
      if (queued.has(key)) return;
      const work = (options.pending(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        if (queued.get(key) !== work) return;
        queued.delete(key);
        await options.refresh(ctx);
      }).catch(options.onError);
      queued.set(key, work);
      options.track(work);
    },
  };
}
