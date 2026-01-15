import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  GitHubViewRepoStructureQuery,
  RepoStructureResult,
  DirectoryEntry,
} from '../../types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { shouldIgnoreFile, shouldIgnoreDir } from '../../utils/file/filters.js';
import { handleCatchError, createSuccessResult } from '../utils.js';
import { getProvider } from '../../providers/factory.js';
import { getActiveProviderConfig } from '../../serverConfig.js';
import { isProviderSuccess } from '../../providers/types.js';

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
    ReturnType<typeof handleCatchError | typeof handleCatchError>
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
  args: ToolExecutionArgs<GitHubViewRepoStructureQuery>
): Promise<CallToolResult> {
  const { queries, authInfo } = args;
  const { provider: providerType, baseUrl, token } = getActiveProviderConfig();

  return executeBulkOperation(
    queries,
    async (query: GitHubViewRepoStructureQuery, _index: number) => {
      try {
        // Get provider instance
        const provider = getProvider(providerType, {
          type: providerType,
          baseUrl,
          token,
          authInfo,
        });

        // Convert query to provider format
        const providerQuery = {
          projectId: `${query.owner}/${query.repo}`,
          ref: String(query.branch),
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
          mainResearchGoal: query.mainResearchGoal,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };

        const apiResult = await provider.getRepoStructure(providerQuery);

        if (!isProviderSuccess(apiResult)) {
          return createEmptyStructureResult(
            query,
            handleCatchError(
              new Error(apiResult.error || 'Provider error'),
              query
            )!
          );
        }

        const filteredStructure = filterStructure(apiResult.data.structure);
        const hasContent = Object.keys(filteredStructure).length > 0;

        const resultData: Record<string, unknown> = {
          owner: query.owner,
          repo: query.repo,
          branch: apiResult.data.branch ?? query.branch,
          path: query.path || '/',
          structure: filteredStructure,
          summary: apiResult.data.summary,
        };

        if (apiResult.data.pagination) {
          resultData.pagination = apiResult.data.pagination;
        }

        const apiHints = apiResult.data.hints || [];
        const entryCount = Object.values(filteredStructure).reduce(
          (sum, entry) => sum + entry.files.length + entry.folders.length,
          0
        );

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
