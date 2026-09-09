import { createHash } from 'node:crypto';
import { executeAwarenessCommand, type AwarenessCommandResult, historyToolEffect, loadWorkspacePolicy } from '@octocodeai/octocode-awareness';
import { isPersistentStorageEnabledForExtension as isPersistentStorageEnabled } from '@octocodeai/config';
import type { PiContext } from '../types.js';
import { getAwarenessAgentId } from '../tools/awareness-shared.js';



interface ToolCallEvent {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ToolEndEvent {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

export interface PiHistoryAdapterOptions {
  run?: typeof executeAwarenessCommand;
  agentId?: (ctx?: PiContext) => string;
  enabled?: (workspace: string) => boolean;
  onError?: (error: Error) => void;
  onAdvisory?: (message: string) => void;
}

export interface PiHistoryAdapter {
  before(event: ToolCallEvent, ctx?: PiContext): Promise<void>;
  after(event: ToolEndEvent, ctx?: PiContext): Promise<void>;
  pending(): number;
}

function sessionId(ctx?: PiContext): string {
  return ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionManager?.getSessionFile?.() ?? 'unknown-session';
}

function operationId(workspace: string, agentId: string, session: string, toolCallId: string): string {
  const digest = createHash('sha256').update(workspace).update('\0').update(agentId).update('\0').update(session).update('\0').update(toolCallId).digest('hex').slice(0, 24);
  return `pi_${digest}`;
}

function assertCommandSuccess(result: AwarenessCommandResult): Record<string, unknown> {
  const payload = result.payload as Record<string, unknown> | null;
  if (result.exitCode !== 0 || payload?.ok !== true) throw new Error(JSON.stringify(result.payload));
  return payload;
}

/** Native Pi adapter for canonical Awareness local history. It records state and never restores it. */
export function createPiHistoryAdapter(options: PiHistoryAdapterOptions = {}): PiHistoryAdapter {
  const run = options.run ?? executeAwarenessCommand;
  const resolveAgentId = options.agentId ?? getAwarenessAgentId;
  const enabled = options.enabled ?? ((workspace: string) =>
    isPersistentStorageEnabled() && loadWorkspacePolicy(workspace).policy.hooks.profile === 'full');
  const active = new Map<string, { operationId: string; workspace: string; agentId: string; sessionId: string }>();
  const report = (error: unknown): void => options.onError?.(error instanceof Error ? error : new Error(String(error)));

  return {
    async before(event, ctx) {
      if (!event.toolCallId || active.has(event.toolCallId)) return;
      const effect = historyToolEffect(event.toolName, event.input);
      if (effect.effect !== 'workspace-write') return;
      const workspace = ctx?.cwd ?? process.cwd();
      if (!enabled(workspace)) return;
      const agentId = resolveAgentId(ctx);
      const session = sessionId(ctx);
      const id = operationId(workspace, agentId, session, event.toolCallId);
      try {
        const payload = assertCommandSuccess(await run({ command: 'history capture', params: {
          phase: 'before', operation_id: id, session_id: session, host: 'pi', label: `${event.toolName} mutation ${id}`, file: effect.files,
        } }, { workspace, agentId, compact: true }));
        const operation = payload['operation'];
        if (operation && typeof operation === 'object' && ['partial', 'failed'].includes(String((operation as Record<string, unknown>)['status']))) {
          options.onAdvisory?.(`Awareness history before-capture ${id} is ${(operation as Record<string, unknown>)['status']}.`);
        }
        if (active.size >= 256) active.delete(active.keys().next().value as string);
        active.set(event.toolCallId, { operationId: id, workspace, agentId, sessionId: session });
      } catch (error) {
        report(error);
      }
    },

    async after(event, ctx) {
      const capture = active.get(event.toolCallId);
      if (!capture) return;
      if ((ctx?.cwd ?? process.cwd()) !== capture.workspace || sessionId(ctx) !== capture.sessionId) {
        report(new Error(`Ignoring stale Pi history completion for ${event.toolCallId}`));
        return;
      }
      try {
        assertCommandSuccess(await run({ command: 'history capture', params: {
          phase: 'after', operation_id: capture.operationId, session_id: capture.sessionId, host: 'pi', outcome: event.isError ? 'failure' : 'success',
        } }, { workspace: capture.workspace, agentId: capture.agentId, compact: true }));
        active.delete(event.toolCallId);
      } catch (error) {
        report(error);
      }
    },

    pending: () => active.size,
  };
}
