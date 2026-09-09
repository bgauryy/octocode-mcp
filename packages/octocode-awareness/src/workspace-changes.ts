import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabasePath } from './db-runtime.js';
import { normalizeWorkspacePath, readGitStatus, repositoryWorkspacePaths } from './git.js';
import { listWork } from './work.js';

interface WorkspaceChangesParams {
  workspacePath?: string | null;
  cwd?: string | null;
  agentId?: string | null;
  limit?: number | null;
  offset?: number;
  revision?: string;
  includeBodies?: boolean | null;
}

/** On-demand Git facts. Declared work is evidence of intent, never authorship. */
export function workspaceChanges(db: DatabaseSync, params: WorkspaceChangesParams) {
  const workspace = normalizeWorkspacePath(params.workspacePath, params.cwd ?? process.cwd())!;
  const workspaces = repositoryWorkspacePaths(workspace);
  const limit = params.limit ?? 10;
  const offset = params.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('attend: limit must be an integer from 1 to 50');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('attend: offset must be a non-negative integer');
  const readRows = () => workspaces.flatMap(workspacePath => [
    ...readGitStatus(workspacePath).map(change => ({ kind: 'git' as const, workspace_path: workspacePath, ...change })),
    ...listWork(db, { workspacePath }).files.map(work => ({
      kind: 'work' as const, workspace_path: workspacePath, path: relative(workspacePath, work.file_path),
      agent_id: work.agent_id, run_id: work.run_id, rationale: work.rationale, test_plan: work.test_plan,
      exclusive: work.exclusive,
    })),
  ]);
  let rows: ReturnType<typeof readRows>;
  try { rows = readRows(); } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'GIT_STATUS_LIMIT') {
      return { ok: false, mode: 'changes' as const, workspace_path: workspace,
        rows: [], count: 0, partial: true, partialReasons: ['terminal_limit'],
        diagnostic: { code: 'GIT_STATUS_LIMIT', limit_bytes: 'limitBytes' in error ? error.limitBytes : undefined,
          message: error.message }, error: error.message };
    }
    throw error;
  }
  rows.sort((a, b) => a.workspace_path.localeCompare(b.workspace_path) || a.path.localeCompare(b.path)
    || a.kind.localeCompare(b.kind) || ('run_id' in a && 'run_id' in b ? a.run_id.localeCompare(b.run_id) : 0));
  const revision = `git-status-v1:${createHash('sha256').update(JSON.stringify({ workspaces, rows })).digest('hex')}`;
  const command = (name: string, args: string[]) => ({ name, args: [
    '--db', getDatabasePath(db), ...args,
    ...(params.agentId ? ['--agent-id', params.agentId] : []), '--compact',
  ] });
  const nextPage = (pageOffset: number) => ({ list: { command: command('attend', [
    '--workspace', workspace, '--changes', '--limit', String(limit),
    '--offset', String(pageOffset), '--revision', revision,
    ...(params.includeBodies ? ['--include-bodies'] : []),
  ]) } });
  const base = { ok: true, mode: 'changes' as const, workspace_path: workspace, revision, total: rows.length };
  // Status cursors cover paths and XY state only. They never claim equal bytes.
  if ((params.revision && params.revision !== revision) || (offset > 0 && !params.revision)) {
    return { ...base, rows: [], count: 0, offset, partial: true,
      partialReasons: ['snapshot_changed'], next: nextPage(0),
      note: 'The path/status page changed or its revision was missing. Follow next to restart.' };
  }
  const selected = rows.slice(offset, offset + limit).map((row, index) => {
    if (row.kind === 'git' || params.includeBodies) return row;
    const { test_plan: _testPlan, ...summary } = row;
    return { ...summary, rationale: row.rationale.slice(0, 160), detail_omitted: true,
      next: { inspect: { command: command('attend', [
        '--workspace', workspace, '--changes', '--limit', '1', '--offset', String(offset + index),
        '--revision', revision, '--include-bodies',
      ]) } },
    };
  });
  const partial = offset + selected.length < rows.length;
  return { ...base, rows: selected, count: selected.length, offset, partial,
    partialReasons: partial ? ['limit'] : [], ...(partial ? { next: nextPage(offset + selected.length) } : {}),
    note: 'Git rows show path/status evidence; work rows show declared intent across linked checkouts. Neither proves authorship, equal file contents or successful verification.' };
}
