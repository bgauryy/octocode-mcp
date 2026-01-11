import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  GitHubViewRepoStructureQuery,
  RepoStructureResult,
  DirectoryEntry,
} from '../../types.js';
import { viewGitHubRepositoryStructureAPI } from '../../github/fileOperations.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { shouldIgnoreFile, shouldIgnoreDir } from '../../utils/file/filters.js';
import {
  handleApiError,
  handleCatchError,
  createSuccessResult,
} from '../utils.js';

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
    entriesPerPage:
      typeof query.entriesPerPage === 'number'
        ? query.entriesPerPage
        : undefined,
    entryPageNumber:
      typeof query.entryPageNumber === 'number'
        ? query.entryPageNumber
        : undefined,
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

export async function exploreMultipleRepositoryStructures(
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

        if (!('structure' in apiResult) || !apiResult.structure) {
          return createEmptyStructureResult(
            query,
            handleCatchError(
              new Error('Invalid API response structure'),
              query
            )!
          );
        }

        const filteredStructure = filterStructure(apiResult.structure);

        const hasContent = Object.keys(filteredStructure).length > 0;

        // Build result data with pagination info
        const resultData: Record<string, unknown> = {
          owner: apiRequest.owner,
          repo: apiRequest.repo,
          branch: apiResult.branch ?? apiRequest.branch,
          path: apiRequest.path || '/',
          structure: filteredStructure,
          summary: apiResult.summary,
        };

        // Include pagination info if present
        if (apiResult.pagination) {
          resultData.pagination = apiResult.pagination;
        }

        // Extract API-generated hints (pagination hints, etc.)
        const apiHints = apiResult.hints || [];

        // Count entries for context-aware hints
        const entryCount = Object.values(filteredStructure).reduce(
          (sum, entry) => sum + entry.files.length + entry.folders.length,
          0
        );

        // Use unified pattern: context for dynamic hints, extraHints for API pagination hints
        return createSuccessResult(
          query,
          resultData,
          hasContent,
          TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
          {
            hintContext: { entryCount },
            extraHints: apiHints,
          }
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
      keysPriority: [
        'owner',
        'repo',
        'branch',
        'path',
        'structure',
        'error',
      ] satisfies Array<keyof RepoStructureResult>,
    }
  );
}
