import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  UserContext,
  ToolInvocationCallback,
  GitHubViewRepoStructureQuery,
  RepoStructureResult,
} from '../types.js';
import { viewGitHubRepositoryStructureAPI } from '../github/fileOperations.js';
import { TOOL_NAMES } from '../constants.js';
import { GitHubViewRepoStructureBulkQuerySchema } from '../scheme/github_view_repo_structure.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { DESCRIPTIONS } from './descriptions.js';
import { shouldIgnoreFile, shouldIgnoreDir } from '../utils/fileFilters.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
} from './utils.js';

export function registerViewGitHubRepoStructureTool(
  server: McpServer,
  callback?: ToolInvocationCallback
) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE],
      inputSchema: GitHubViewRepoStructureBulkQuerySchema.shape,
      annotations: {
        title: 'GitHub Repository Structure Explorer',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      async (
        args: {
          queries: GitHubViewRepoStructureQuery[];
        },
        authInfo,
        userContext
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        // Invoke callback if provided
        if (callback) {
          try {
            await callback(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE, queries);
          } catch {
            // Silently ignore callback errors
          }
        }

        return exploreMultipleRepositoryStructures(
          queries,
          authInfo,
          userContext
        );
      }
    )
  );
}

/**
 * Build API request from query with proper type conversions
 */
function buildStructureApiRequest(
  query: GitHubViewRepoStructureQuery
): GitHubViewRepoStructureQuery {
  return {
    mainResearchGoal: query.mainResearchGoal,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    owner: String(query.owner),
    repo: String(query.repo),
    branch: String(query.branch),
    path: query.path ? String(query.path) : undefined,
    depth: typeof query.depth === 'number' ? query.depth : undefined,
  };
}

/**
 * Filter files and folders to exclude ignored items
 */
function filterStructureItems(apiResult: {
  files: Array<{ path: string }>;
  folders?: { folders?: Array<{ path: string }> };
}) {
  const filteredFiles = apiResult.files.filter(
    file => !shouldIgnoreFile(file.path)
  );

  const filteredFolders = (apiResult.folders?.folders || []).filter(folder => {
    const folderName = folder.path.split('/').pop() || '';
    return !shouldIgnoreDir(folderName) && !shouldIgnoreFile(folder.path);
  });

  return { filteredFiles, filteredFolders };
}

/**
 * Remove path prefix from file/folder paths
 */
function removePathPrefix(path: string, prefix: string): string {
  return prefix && path.startsWith(prefix)
    ? path.substring(prefix.length)
    : path;
}

/**
 * Create empty structure result for error cases
 */
function createEmptyStructureResult(
  query: GitHubViewRepoStructureQuery,
  error: NonNullable<
    ReturnType<typeof handleApiError | typeof handleCatchError>
  >
): Record<string, unknown> & {
  status: 'error';
  owner: string;
  repo: string;
  path: string;
  files: string[];
  folders: string[];
} {
  return {
    owner: query.owner,
    repo: query.repo,
    path: query.path || '/',
    files: [],
    folders: [],
    ...error,
  } as Record<string, unknown> & {
    status: 'error';
    owner: string;
    repo: string;
    path: string;
    files: string[];
    folders: string[];
  };
}

async function exploreMultipleRepositoryStructures(
  queries: GitHubViewRepoStructureQuery[],
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: GitHubViewRepoStructureQuery, _index: number) => {
      try {
        const apiRequest = buildStructureApiRequest(query);

        const apiResult = await viewGitHubRepositoryStructureAPI(
          apiRequest,
          authInfo,
          userContext
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) {
          return createEmptyStructureResult(query, apiError);
        }

        if (!('files' in apiResult) || !Array.isArray(apiResult.files)) {
          return createEmptyStructureResult(
            query,
            handleCatchError(
              new Error('Invalid API response structure'),
              query
            )!
          );
        }

        const { filteredFiles, filteredFolders } =
          filterStructureItems(apiResult);

        const pathPrefix = apiRequest.path || '/';
        const normalizedPrefix = pathPrefix === '/' ? '' : pathPrefix;

        const filePaths = filteredFiles.map(file =>
          removePathPrefix(file.path, normalizedPrefix)
        );

        const folderPaths = filteredFolders.map(folder =>
          removePathPrefix(folder.path, normalizedPrefix)
        );

        const hasContent = filePaths.length > 0 || folderPaths.length > 0;

        return createSuccessResult(
          query,
          {
            owner: apiRequest.owner,
            repo: apiRequest.repo,
            path: apiRequest.path || '/',
            files: filePaths,
            folders: folderPaths,
          },
          hasContent,
          'GITHUB_VIEW_REPO_STRUCTURE'
        );
      } catch (error) {
        const catchError = handleCatchError(
          error,
          query,
          'Failed to explore repository structure'
        );
        return createEmptyStructureResult(query, catchError);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      keysPriority: ['path', 'files', 'folders', 'error'] satisfies Array<
        keyof RepoStructureResult
      >,
    }
  );
}
