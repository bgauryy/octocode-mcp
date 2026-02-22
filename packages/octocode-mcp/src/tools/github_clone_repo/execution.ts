/**
 * Bulk execution handler for the githubCloneRepo tool.
 *
 * Orchestrates cloning / sparse-fetching of GitHub repositories and
 * returns structured results with actionable next-step hints.
 */

import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CloneRepoQuery } from './types.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { handleCatchError, createSuccessResult } from '../utils.js';
import {
  getActiveProviderConfig,
  getActiveProvider,
} from '../../serverConfig.js';
import { cloneRepo } from './cloneRepo.js';
import {
  LOCAL_TOOL_LIST,
  LSP_TOOL_LIST,
} from '../../hints/localToolUsageHints.js';

// ─────────────────────────────────────────────────────────────────────
// Hints
// ─────────────────────────────────────────────────────────────────────

/** Hints for full clones */
const FULL_CLONE_HINTS: string[] = [
  'Repository cloned locally (full, shallow depth=1).',
  'Use `localPath` as the `path` parameter for local tools:',
  ...LOCAL_TOOL_LIST,
  ...LSP_TOOL_LIST,
  'Tip: start with localViewStructure to understand the project layout.',
];

/** Hints for sparse (partial) checkouts */
const SPARSE_CLONE_HINTS: string[] = [
  'Partial tree fetched (sparse checkout – only the requested path was downloaded).',
  'Use `localPath` as the `path` parameter for local tools:',
  ...LOCAL_TOOL_LIST,
  'Note: LSP may have limited cross-file resolution in sparse checkouts.',
  'If you need full project context, re-clone without sparse_path.',
];

/** Hints for cached results */
const CACHE_HIT_HINT =
  'Served from 24-hour cache (no network call). To force refresh, set forceRefresh: true in the query.';

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────

export async function executeCloneRepo(
  args: ToolExecutionArgs<CloneRepoQuery>
): Promise<CallToolResult> {
  const { queries, authInfo } = args;

  // ── GitHub-only guard ───────────────────────────────────────────
  if (getActiveProvider() !== 'github') {
    return executeBulkOperation(
      queries,
      async (query: CloneRepoQuery) =>
        handleCatchError(
          new Error(
            'githubCloneRepo is only available with the GitHub provider. ' +
              'GitLab is not supported yet.'
          ),
          query,
          'Provider not supported',
          TOOL_NAMES.GITHUB_CLONE_REPO
        ),
      {
        toolName: TOOL_NAMES.GITHUB_CLONE_REPO,
        keysPriority: ['error'],
      }
    );
  }

  const { token } = getActiveProviderConfig();

  return executeBulkOperation(
    queries,
    async (query: CloneRepoQuery, _index: number) => {
      try {
        const result = await cloneRepo(query, authInfo, token);

        // ── Build result data ──────────────────────────────────
        const resultData: Record<string, unknown> = {
          owner: result.owner,
          repo: result.repo,
          branch: result.branch,
          localPath: result.localPath,
          ...(result.sparse_path ? { sparse_path: result.sparse_path } : {}),
        };

        // ── Pick contextual hints ──────────────────────────────
        const baseHints = result.sparse_path
          ? [...SPARSE_CLONE_HINTS]
          : [...FULL_CLONE_HINTS];

        if (result.cached) {
          baseHints.unshift(CACHE_HIT_HINT);
        }

        return createSuccessResult(
          query,
          resultData,
          true, // always hasResults on success
          TOOL_NAMES.GITHUB_CLONE_REPO,
          { extraHints: baseHints }
        );
      } catch (error) {
        return handleCatchError(
          error,
          query,
          `Clone failed for ${query.owner}/${query.repo}`,
          TOOL_NAMES.GITHUB_CLONE_REPO
        );
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_CLONE_REPO,
      keysPriority: [
        'owner',
        'repo',
        'branch',
        'sparse_path',
        'localPath',
        'error',
      ],
    }
  );
}
