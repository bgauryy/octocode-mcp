import type { PiContext, ToolCallResult } from '../types.js';
import { emitExecution } from './execution-runtime.js';
import { executionLabel, record } from './execution-presentation.js';

/** Observe each actual prompt, including sequential batches and durable host waits. */
export async function observeExecutionQuestion<
  T extends
    ToolCallResult | { status: string; interaction?: unknown } | undefined,
>(
  ctx: PiContext | undefined,
  id: string,
  question: unknown,
  execute: () => Promise<T>,
  kind: 'question' | 'permission' = 'question'
): Promise<T> {
  const title = executionLabel(question) || 'Answer the pending question';
  emitExecution(ctx, `${kind}.requested`, { id, title });
  try {
    const result = await execute();
    const value = record(result);
    const details = record(value.details ?? result);
    const status = details.status;
    const decision = value.isError
      ? 'failed'
      : ['selected', 'text', 'multiSelected', 'form'].includes(String(status))
        ? 'answered'
        : typeof status === 'string'
          ? status
          : 'unavailable';
    emitExecution(ctx, `${kind}.resolved`, { id, decision });
    const interaction = record(details.interaction);
    if (status === 'pending' && typeof interaction.interactionId === 'string') {
      const expiresAt =
        typeof interaction.expiresAt === 'string'
          ? Date.parse(interaction.expiresAt)
          : undefined;
      emitExecution(ctx, `${kind}.requested`, {
        id: interaction.interactionId,
        title,
        persistent: true,
        ...(expiresAt !== undefined && Number.isFinite(expiresAt)
          ? { expiresAt }
          : {}),
      });
    }
    return result;
  } catch (error) {
    emitExecution(ctx, `${kind}.resolved`, {
      id,
      decision: ctx?.signal?.aborted ? 'cancelled' : 'failed',
    });
    throw error;
  }
}
