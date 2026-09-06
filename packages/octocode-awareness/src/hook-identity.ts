/** Stable routing identity shared by package hook entry points. Labels never identify sessions. */
export function resolveHookAgentId(payload: Record<string, unknown>, input: Record<string, unknown> = {}): string {
  for (const value of [
    payload.agent_id, payload.agentId, input.agent_id, input.agentId,
    process.env.OCTOCODE_AGENT_ID,
    payload.session_id, payload.sessionId, input.session_id, input.sessionId,
  ]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  throw new Error('Awareness hook requires a stable agent_id/session_id or OCTOCODE_AGENT_ID. Configure a distinct identity for each session and reuse it in CLI commands; anonymous workspace/host identities are unsafe.');
}
