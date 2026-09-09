import { writeCommandDiagnostic } from '../command-output.js';
import { createHash } from 'node:crypto';
import { runAwarenessHistoryOperation } from '../history.js';
import { agentId, db, sessionId, shellHookHost, workspace } from './payload.js';
import type { normalizeToolHookPayload } from './tool-protocol.js';

type NormalizedTool = ReturnType<typeof normalizeToolHookPayload>;

function historyOperationId(payload: Record<string, unknown>, tool: NormalizedTool): string | null {
  if (!tool.correlationId) return null;
  return `hook_${createHash('sha256')
    .update(workspace(payload) ?? process.cwd()).update('\0')
    .update(agentId(payload)).update('\0')
    .update(sessionId(payload) ?? 'unknown-session').update('\0')
    .update(tool.correlationId).digest('hex').slice(0, 24)}`;
}

/** Capture admitted/terminal generic hook writes in the canonical history store. */
export async function captureHookHistory(
  payload: Record<string, unknown>,
  tool: NormalizedTool,
): Promise<void> {
  if (tool.tool.effect !== 'workspace-write') return;
  if (tool.phase === 'pre' && tool.tool.files.length === 0) return;
  const operationId = historyOperationId(payload, tool);
  if (!operationId) return; // correlation loss must not create an uncloseable operation
  if (tool.phase === 'post' && !tool.outcome.terminal) return;

  let historyDb: ReturnType<typeof db> | undefined;
  try {
    historyDb = db(payload, 'history');
    await runAwarenessHistoryOperation(historyDb, 'capture', {
      workspace: workspace(payload) ?? process.cwd(),
      agent_id: agentId(payload),
      phase: tool.phase === 'pre' ? 'before' : 'after',
      operation_id: operationId,
      ...(tool.phase === 'pre' ? { file: tool.tool.files } : {}),
      ...(tool.phase === 'post' ? {
        outcome: tool.outcome.kind === 'success' ? 'success'
          : tool.outcome.kind === 'interrupted' ? 'interrupted'
            : tool.outcome.kind === 'timeout' ? 'timeout'
              : tool.outcome.kind === 'failure' || tool.outcome.kind === 'denied' ? 'failure'
                : 'unknown',
      } : {}),
      host: shellHookHost(payload),
      ...(sessionId(payload) ? { session_id: sessionId(payload)! } : {}),
    });
  } catch (error) {
    // History is observational. A capture failure must not deny or rewrite the
    // host mutation whose real admission is owned by the guard path.
    writeCommandDiagnostic(`octocode-awareness history capture warning (continuing): ${(error as Error).message}`);
  } finally {
    historyDb?.close();
  }
}
