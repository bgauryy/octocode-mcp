import type { AwarenessQueryParams, AwarenessQueryView, QueryContinuationState } from './repo-model.js';

/** Preserve executable read scope as a bounded query expands. */
export function queryContinuation(database: string, workspace: string | null, view: AwarenessQueryView,
  params: AwarenessQueryParams, requestedLimit: number, partial: boolean): QueryContinuationState {
  if (!partial) return {};
  const cap = view === 'workboard' ? 50 : 500;
  if (requestedLimit >= cap) return { terminal_limit: { code: 'QUERY_VIEW_LIMIT', view, limit: cap } };
  const args = ['--db', database, '--view', view, '--limit', String(Math.min(cap, requestedLimit * 2)), '--compact'];
  for (const [flag, value] of Object.entries({ workspace, artifact: params.artifact, repo: params.repo, ref: params.ref,
    query: params.query, agent_id: params.agentId, state: params.state, label: params.label, file: params.file, since: params.since })) {
    if (value == null) continue;
    for (const item of Array.isArray(value) ? value : [value]) args.push(`--${flag.replaceAll('_', '-')}`, String(item));
  }
  if (params.includeBodies) args.push('--include-bodies');
  return { next: { list: { command: { name: 'query', args } } } };
}
