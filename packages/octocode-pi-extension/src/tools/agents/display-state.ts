export type WorkerDisplayState =
  | 'starting'
  | 'queued'
  | 'running'
  | 'idle'
  | 'done'
  | 'blocked'
  | 'failed'
  | 'killed';

/** Shared by the footer, inbox, event journal, and agent result cards. */
export function effectiveAgentStatus(entry: {
  status?: string;
  normalizedStatus?: string;
  pendingMessages?: number;
}): WorkerDisplayState {
  const processStatus = entry.status?.toLowerCase() ?? 'starting';
  const outcome = entry.normalizedStatus?.toLowerCase();
  if (processStatus === 'killed') return 'killed';
  if (
    processStatus === 'failed' ||
    processStatus === 'error'
  )
    return 'failed';
  if (processStatus === 'running') return 'running';
  const exited = ['done', 'completed', 'exited'].includes(processStatus);
  // A queued follow-up supersedes the previous handback before its next turn starts.
  if (!exited && (entry.pendingMessages ?? 0) > 0) return 'queued';
  if (outcome === 'failed') return 'failed';
  if (outcome === 'blocked' || processStatus === 'blocked') return 'blocked';
  if (exited || outcome === 'done') return 'done';
  return processStatus === 'idle' ? 'idle' : 'starting';
}
