import { createHash } from 'node:crypto';
import { execHistoryCli, historyToolEffect } from '@octocodeai/octocode-awareness';
import { isPersistentStorageEnabledForExtension as isPersistentStorageEnabled } from '@octocodeai/config';
import type { PiContext } from '../types.js';
import { getAwarenessAgentId } from '../tools/awareness-shared.js';

interface AwarenessRunResult { code: number; stdout: string; stderr: string }

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
  run?: (args: string[]) => Promise<AwarenessRunResult>;
  agentId?: (ctx?: PiContext) => string;
  enabled?: () => boolean;
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

function assertCliSuccess(result: AwarenessRunResult): Record<string, unknown> {
  let payload: unknown;
  try { payload = JSON.parse(result.stdout); } catch { /* handled below */ }
  const ok = payload && typeof payload === 'object' && (payload as { ok?: unknown }).ok === true;
  if (result.code !== 0 || !ok) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Awareness history capture exited ${result.code}`);
  }
  return payload as Record<string, unknown>;
}

/** Native Pi adapter for canonical Awareness local history. It records state and never restores it. */
export function createPiHistoryAdapter(options: PiHistoryAdapterOptions = {}): PiHistoryAdapter {
  const run = options.run ?? execHistoryCli;
  const resolveAgentId = options.agentId ?? getAwarenessAgentId;
  const enabled = options.enabled ?? isPersistentStorageEnabled;
  const active = new Map<string, { operationId: string; workspace: string; agentId: string; sessionId: string }>();
  const report = (error: unknown): void => options.onError?.(error instanceof Error ? error : new Error(String(error)));

  return {
    async before(event, ctx) {
      if (!enabled() || !event.toolCallId || active.has(event.toolCallId)) return;
      const effect = historyToolEffect(event.toolName, event.input);
      if (effect.effect !== 'workspace-write') return;
      const workspace = ctx?.cwd ?? process.cwd();
      const agentId = resolveAgentId(ctx);
      const session = sessionId(ctx);
      const id = operationId(workspace, agentId, session, event.toolCallId);
      try {
        const args = ['history', 'capture', '--phase', 'before', '--operation-id', id, '--agent-id', agentId, '--workspace', workspace, '--session-id', session, '--host', 'pi', '--label', `${event.toolName} mutation ${id}`, '--compact'];
        for (const file of effect.files) args.push('--file', file);
        const payload = assertCliSuccess(await run(args));
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
        assertCliSuccess(await run([
          'history', 'capture', '--phase', 'after', '--operation-id', capture.operationId,
          '--agent-id', capture.agentId, '--workspace', capture.workspace,
          '--session-id', capture.sessionId, '--host', 'pi',
          '--outcome', event.isError ? 'failure' : 'success', '--compact',
        ]));
        active.delete(event.toolCallId);
      } catch (error) {
        report(error);
      }
    },

    pending: () => active.size,
  };
}
