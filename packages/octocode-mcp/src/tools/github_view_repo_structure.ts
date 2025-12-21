import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type {
  ToolInvocationCallback,
  GitHubViewRepoStructureQuery,
  RepoStructureResult,
  DirectoryEntry,
} from '../types.js';
import { viewGitHubRepositoryStructureAPI } from '../github/fileOperations.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';
import { GitHubViewRepoStructureBulkQuerySchema } from '../scheme/github_view_repo_structure.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { shouldIgnoreFile, shouldIgnoreDir } from '../utils/fileFilters.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
} from './utils.js';

export function registerViewGitHubRepoStructureTool(
  server: McpServer,
  callback?: ToolInvocationCallback
): RegisteredTool {
  return server.registerTool(
    TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    {
      description: DESCRIPTIONS[TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE],
      inputSchema: GitHubViewRepoStructureBulkQuerySchema,
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
        sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        if (callback) {
          try {
            await callback(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE, queries);
          } catch {
            // ignore
          }
        }

        return exploreMultipleRepositoryStructures(
          queries,
          authInfo,
          sessionId
        );
      }
    )
  );
}

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
 * Filter structure entries to remove ignored files and folders.
 * Structure is a Record<string, DirectoryEntry> where keys are relative paths.
 */
function filterStructure(
  structure: Record<string, DirectoryEntry>
): Record<string, DirectoryEntry> {
  const filtered: Record<string, DirectoryEntry> = {};

  for (const [dirPath, entry] of Object.entries(structure)) {
    const filteredFiles = entry.files.filter(
      fileName => !shouldIgnoreFile(fileName)
    );
    const filteredFolders = entry.folders.filter(
      folderName => !shouldIgnoreDir(folderName)
    );

    // Only include directory if it has content after filtering
    if (filteredFiles.length > 0 || filteredFolders.length > 0) {
      filtered[dirPath] = {
        files: filteredFiles,
        folders: filteredFolders,
      };
    }
  }

  return filtered;
}

function createEmptyStructureResult(
  query: GitHubViewRepoStructureQuery,
  error: NonNullable<
    ReturnType<typeof handleApiError | typeof handleCatchError>
  >
): Record<string, unknown> & {
  status: 'error';
  path: string;
  structure: Record<string, DirectoryEntry>;
} {
  // Only include NEW data - owner/repo already in query, don't duplicate
  return {
    path: query.path || '/',
    structure: {},
    ...error,
  } as Record<string, unknown> & {
    status: 'error';
    path: string;
    structure: Record<string, DirectoryEntry>;
  };
}

async function exploreMultipleRepositoryStructures(
  queries: GitHubViewRepoStructureQuery[],
  authInfo?: AuthInfo,
  sessionId?: string
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: GitHubViewRepoStructureQuery, _index: number) => {
      try {
        const apiRequest = buildStructureApiRequest(query);

        const apiResult = await viewGitHubRepositoryStructureAPI(
          apiRequest,
          authInfo,
          sessionId
        );

        const apiError = handleApiError(apiResult, query);
        if (apiError) {
          return createEmptyStructureResult(query, apiError);
        }

        // New format uses 'structure' field
        if (!('structure' in apiResult) || !apiResult.structure) {
          return createEmptyStructureResult(
            query,
            handleCatchError(
              new Error('Invalid API response structure'),
              query
            )!
          );
        }

        // Filter structure to remove ignored files/folders
        const filteredStructure = filterStructure(apiResult.structure);

        // Check if there's any content
        const hasContent = Object.keys(filteredStructure).length > 0;

        return createSuccessResult(
          query,
          {
            path: apiRequest.path || '/',
            structure: filteredStructure,
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
      keysPriority: ['path', 'structure', 'error'] satisfies Array<
        keyof RepoStructureResult
      >,
    }
  );
}
