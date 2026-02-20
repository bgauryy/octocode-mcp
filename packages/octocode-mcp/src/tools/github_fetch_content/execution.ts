import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { FileContentQuery } from './types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { handleCatchError, createSuccessResult } from '../utils.js';
import { getProvider } from '../../providers/factory.js';
import { getActiveProviderConfig, isCloneEnabled } from '../../serverConfig.js';
import { isProviderSuccess, type ProviderType } from '../../providers/types.js';
import { fetchDirectoryContents } from '../../github/directoryFetch.js';
import { resolveDefaultBranch } from '../../github/client.js';

// ─────────────────────────────────────────────────────────────────────
// Directory fetch hints
// ─────────────────────────────────────────────────────────────────────

const DIRECTORY_FETCH_HINTS: string[] = [
  'Directory fetched and saved to disk.',
  'Use `localPath` as the `path` parameter for local tools:',
  '  localSearchCode – search code with ripgrep',
  '  localGetFileContent – read file content',
  '  localViewStructure – browse the directory tree',
  '  localFindFiles – find files by name/metadata',
  'Tip: start with localViewStructure to explore the fetched directory.',
];

const DIRECTORY_CACHE_HIT_HINT =
  'Served from 24-hour cache (no network call). To force refresh, wait for expiry or manually delete the localPath.';

// ─────────────────────────────────────────────────────────────────────
// Keys priority for directory results
// ─────────────────────────────────────────────────────────────────────

const DIRECTORY_KEYS_PRIORITY = [
  'owner',
  'repo',
  'directoryPath',
  'branch',
  'localPath',
  'fileCount',
  'totalSize',
  'files',
  'cached',
  'expiresAt',
  'error',
];

// ─────────────────────────────────────────────────────────────────────
// File content keys priority
// ─────────────────────────────────────────────────────────────────────

const FILE_KEYS_PRIORITY = [
  'owner',
  'repo',
  'path',
  'branch',
  'contentLength',
  'content',
  'pagination',
  'isPartial',
  'startLine',
  'endLine',
  'lastModified',
  'lastModifiedBy',
  'matchLocations',
  'error',
];

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────

export async function fetchMultipleGitHubFileContents(
  args: ToolExecutionArgs<FileContentQuery>
): Promise<CallToolResult> {
  const { queries, authInfo } = args;
  const { provider: providerType, baseUrl, token } = getActiveProviderConfig();

  // Determine if any query uses directory mode (for keysPriority)
  const hasDirectoryQuery = queries.some(q => q.type === 'directory');
  const hasFileQuery = queries.some(q => q.type !== 'directory');

  // Use directory keys if all queries are directory type
  const keysPriority =
    hasDirectoryQuery && !hasFileQuery
      ? DIRECTORY_KEYS_PRIORITY
      : FILE_KEYS_PRIORITY;

  return executeBulkOperation(
    queries,
    async (query: FileContentQuery, _index: number) => {
      try {
        // ── Directory mode ────────────────────────────────────────
        if (query.type === 'directory') {
          return handleDirectoryFetch(query, authInfo);
        }

        // ── File mode (default) ──────────────────────────────────
        return handleFileFetch(query, providerType, baseUrl, token, authInfo);
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      keysPriority,
    }
  );
}

// ─────────────────────────────────────────────────────────────────────
// Directory fetch handler
// ─────────────────────────────────────────────────────────────────────

async function handleDirectoryFetch(
  query: FileContentQuery,
  authInfo?: AuthInfo
) {
  // Directory mode requires ENABLE_LOCAL=true and ENABLE_CLONE=true
  if (!isCloneEnabled()) {
    return handleCatchError(
      new Error(
        'Directory fetch requires ENABLE_LOCAL=true and ENABLE_CLONE=true. ' +
          'Directory mode saves files to disk using the same cache as githubCloneRepo.'
      ),
      query,
      'Clone not enabled',
      TOOL_NAMES.GITHUB_FETCH_CONTENT
    );
  }

  // Resolve branch: use provided value, or auto-detect via GitHub API (like githubCloneRepo)
  const branch =
    query.branch ??
    (await resolveDefaultBranch(query.owner, query.repo, authInfo));

  const result = await fetchDirectoryContents(
    query.owner,
    query.repo,
    String(query.path),
    branch,
    authInfo
  );

  const resultData: Record<string, unknown> = {
    owner: result.owner,
    repo: result.repo,
    directoryPath: result.directoryPath,
    branch: result.branch,
    localPath: result.localPath,
    fileCount: result.fileCount,
    totalSize: result.totalSize,
    files: result.files,
    cached: result.cached,
    expiresAt: result.expiresAt,
  };

  const hints = [...DIRECTORY_FETCH_HINTS];
  if (result.cached) {
    hints.unshift(DIRECTORY_CACHE_HIT_HINT);
  }

  return createSuccessResult(
    query,
    resultData,
    true,
    TOOL_NAMES.GITHUB_FETCH_CONTENT,
    { extraHints: hints }
  );
}

// ─────────────────────────────────────────────────────────────────────
// File fetch handler (existing flow)
// ─────────────────────────────────────────────────────────────────────

async function handleFileFetch(
  query: FileContentQuery,
  providerType: ProviderType,
  baseUrl: string | undefined,
  token: string | undefined,
  authInfo?: AuthInfo
) {
  const provider = getProvider(providerType, {
    type: providerType,
    baseUrl,
    token,
    authInfo,
  });

  const fullContent = Boolean(query.fullContent);

  // Convert query to provider format
  const providerQuery = {
    projectId: `${query.owner}/${query.repo}`,
    path: String(query.path),
    ref: query.branch ? String(query.branch) : undefined,
    startLine: fullContent ? undefined : query.startLine,
    endLine: fullContent ? undefined : query.endLine,
    matchString:
      fullContent || !query.matchString ? undefined : String(query.matchString),
    matchStringContextLines: query.matchStringContextLines ?? 5,
    charOffset: query.charOffset ?? 0,
    charLength: query.charLength,
    fullContent,
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
  };

  const apiResult = await provider.getFileContent(providerQuery);

  if (!isProviderSuccess(apiResult)) {
    return handleCatchError(
      new Error(apiResult.error || 'Provider error'),
      query
    );
  }

  // Transform provider response to tool result format
  const resultData: Record<string, unknown> = {
    owner: query.owner,
    repo: query.repo,
    path: apiResult.data.path,
    branch: apiResult.data.ref,
    contentLength: apiResult.data.size,
    content: apiResult.data.content,
    ...(apiResult.data.isPartial && {
      isPartial: apiResult.data.isPartial,
    }),
    ...(apiResult.data.startLine && {
      startLine: apiResult.data.startLine,
    }),
    ...(apiResult.data.endLine && { endLine: apiResult.data.endLine }),
    ...(apiResult.data.lastModified && {
      lastModified: apiResult.data.lastModified,
    }),
    ...(apiResult.data.lastModifiedBy && {
      lastModifiedBy: apiResult.data.lastModifiedBy,
    }),
    ...(apiResult.data.pagination && {
      pagination: apiResult.data.pagination,
    }),
  };

  const hasContent = Boolean(
    apiResult.data.content && apiResult.data.content.length > 0
  );

  const paginationHints = apiResult.hints || [];
  const isLarge = apiResult.data.size > 50000;

  return createSuccessResult(
    query,
    resultData,
    hasContent,
    TOOL_NAMES.GITHUB_FETCH_CONTENT,
    {
      hintContext: { isLarge },
      extraHints: paginationHints,
    }
  );
}
