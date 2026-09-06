/** Stable identity shared by native Pi events and the Awareness CLI environment. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { PiContext } from '../types.js';

/**
 * Keep explicit user/worker identities, but refresh identities generated here
 * when Pi switches sessions. Calls without a session retain the outgoing ID so
 * shutdown can leave its registry row before the next session joins.
 * Shared by native event delivery, mutation guards and the CLI environment.
 */
let generatedAgentId: string | undefined;

export function getAwarenessAgentId(ctx?: PiContext): string {
  const configured = process.env.OCTOCODE_AGENT_ID;
  if (configured && configured !== generatedAgentId) return configured;
  const sessionFile = ctx?.sessionManager?.getSessionFile?.();
  const sessionId = ctx?.sessionManager?.getSessionId?.()
    ?? (sessionFile ? `file:${createHash('sha256').update(path.resolve(sessionFile)).digest('hex').slice(0, 24)}` : undefined);
  if (!sessionId && configured) return configured;
  const agentId = `pi:${sessionId || process.pid}`;
  generatedAgentId = agentId;
  process.env.OCTOCODE_AGENT_ID = agentId;
  return agentId;
}

/** Human labels are separate from routing IDs; provider labels are reported, never guessed. */
export function getAwarenessAgentIdentity(ctx?: PiContext): {
  agentId: string;
  name: string;
  metadata: { vendor: string | null; host: string };
} {
  const agentId = getAwarenessAgentId(ctx);
  return {
    agentId,
    name: process.env.OCTOCODE_AGENT_NAME?.trim() || ctx?.sessionManager?.getSessionName?.()?.trim() || agentId,
    metadata: {
      // Workers inherit their parent's environment, but may select a different provider.
      vendor: ctx?.model?.provider?.trim() || process.env.OCTOCODE_AGENT_VENDOR?.trim() || null,
      host: 'pi',
    },
  };
}
