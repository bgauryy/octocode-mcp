import type { PiContext, PiInstance } from '../types.js';
import { runtimeStoreFor } from './runtime-renderer.js';

/** Project execution into existing UI surfaces; never add tool output to model context. */
export function registerLifecycleUi(pi: PiInstance, repaint: (ctx?: PiContext) => void): void {
  const warnedTools = new WeakMap<object, Set<string>>();
  const refresh = (ctx: PiContext): void => {
    try { if (ctx.hasUI) repaint(ctx); } catch { /* a replaced UI cannot interrupt execution */ }
  };
  pi.on('tool_execution_start', async (event: { toolCallId?: string; toolName?: string }, ctx: PiContext) => {
    const store = runtimeStoreFor(ctx);
    if (!store || !event.toolCallId) return;
    // Names are routing identifiers. Arguments and results can contain private data.
    const name = (event.toolName ?? 'tool').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 64) || 'tool';
    const calls = store.getState().footer.toolCalls ?? [];
    store.getState().setFooter({ toolCalls: [...calls.filter((call) => call.id !== event.toolCallId), { id: event.toolCallId, name }] });
    refresh(ctx);
  });
  pi.on('tool_execution_end', async (event: { toolCallId?: string; isError?: boolean }, ctx: PiContext) => {
    const store = runtimeStoreFor(ctx);
    const calls = store?.getState().footer.toolCalls ?? [];
    const completed = calls.find((call) => call.id === event.toolCallId);
    if (!store || !completed) return; // Replaced session or already-cleared aborted turn.
    store.getState().setFooter({ toolCalls: calls.filter((call) => call.id !== event.toolCallId) });
    if (event.isError && ctx.hasUI) {
      const warned = warnedTools.get(ctx) ?? new Set<string>();
      warnedTools.set(ctx, warned);
      if (!warned.has(completed.name)) {
        warned.add(completed.name);
        try { ctx.ui?.notify?.(`${completed.name} failed. See its result for details.`, 'warning'); } catch { /* best-effort UI */ }
      }
    }
    refresh(ctx);
  });
  pi.on('turn_end', async (_event, ctx) => {
    runtimeStoreFor(ctx)?.getState().setFooter({ toolCalls: [] });
    warnedTools.delete(ctx);
    refresh(ctx);
  });
  pi.on('session_before_compact', async (_event, ctx) => {
    runtimeStoreFor(ctx)?.getState().setFooter({ compacting: true });
    refresh(ctx);
  });
  const finishCompaction = async (_event: unknown, ctx: PiContext): Promise<void> => {
    runtimeStoreFor(ctx)?.getState().setFooter({ compacting: false });
    refresh(ctx);
  };
  pi.on('session_compact', finishCompaction);
  pi.on('session_compact_failed', finishCompaction);
}
