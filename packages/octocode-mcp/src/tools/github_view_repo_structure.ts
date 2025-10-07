import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  UserContext,
  withSecurityValidation,
} from '../security/withSecurityValidation';
import { createResult } from '../responses';
import { viewGitHubRepositoryStructureAPI } from '../github/index';
import { TOOL_NAMES } from '../constants';
import {
  GitHubViewRepoStructureQuery,
  GitHubViewRepoStructureBulkQuerySchema,
  type RepoStructureResult,
} from '../scheme/github_view_repo_structure.js';
import { generateEmptyQueryHints } from './hints';
import {
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
} from '../utils/bulkOperations';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions';
import { shouldIgnoreFile, shouldIgnoreDir } from '../utils/fileFilters';

export function registerViewGitHubRepoStructureTool(server: McpServer) {
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
        if (
          !args.queries ||
          !Array.isArray(args.queries) ||
          args.queries.length === 0
        ) {
          const hints = generateEmptyQueryHints(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE
          );

          return createResult({
            data: { error: 'Queries array is required and cannot be empty' },
            hints,
            isError: true,
          });
        }

        return exploreMultipleRepositoryStructures(
          args.queries,
          authInfo,
          userContext
        );
      }
    )
  );
}

async function exploreMultipleRepositoryStructures(
  queries: GitHubViewRepoStructureQuery[],
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  const { results, errors } = await processBulkQueries(
    queries,
    async (
      query: GitHubViewRepoStructureQuery,
      _index: number
    ): Promise<RepoStructureResult> => {
      try {
        // TypeScript and Zod validation ensure all required fields are properly typed
        // No manual validation needed - trust the type system!

        // Create API request with properly typed fields
        const apiRequest: GitHubViewRepoStructureQuery = {
          reasoning: query.reasoning,
          owner: String(query.owner),
          repo: String(query.repo),
          branch: String(query.branch),
          path: query.path ? String(query.path) : undefined,
          depth: typeof query.depth === 'number' ? query.depth : undefined,
          researchSuggestions: query.researchSuggestions,
        };

        const apiResult = await viewGitHubRepositoryStructureAPI(
          apiRequest,
          authInfo,
          userContext
        );

        // Check if result is an error
        if ('error' in apiResult) {
          return {
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            researchSuggestions: query.researchSuggestions,
            owner: query.owner,
            repo: query.repo,
            path: query.path || '/',
            files: [],
            folders: [],
            error: apiResult.error,
            metadata: {
              error: apiResult.error,
              searchType: 'api_error',
            },
          };
        }

        // Success case - use simplified structure with filtering

        // Filter files using the centralized file filtering logic
        const filteredFiles = apiResult.files.filter(
          file => !shouldIgnoreFile(file.path)
        );

        // Filter folders using the centralized directory filtering logic
        const filteredFolders = (apiResult.folders?.folders || []).filter(
          folder => {
            // Extract folder name from path for shouldIgnoreDir check
            const folderName = folder.path.split('/').pop() || '';
            return (
              !shouldIgnoreDir(folderName) && !shouldIgnoreFile(folder.path)
            );
          }
        );

        const hasResults =
          filteredFiles.length > 0 || filteredFolders.length > 0;

        // Extract file paths and folder paths separately, removing the path prefix
        const pathPrefix = apiRequest.path || '/';
        const normalizedPrefix = pathPrefix === '/' ? '' : pathPrefix;

        const filePaths = filteredFiles.map(file => {
          // Remove the path prefix if it exists
          if (normalizedPrefix && file.path.startsWith(normalizedPrefix)) {
            return file.path.substring(normalizedPrefix.length);
          }
          return file.path;
        });

        const folderPaths = filteredFolders.map(folder => {
          // Remove the path prefix if it exists
          if (normalizedPrefix && folder.path.startsWith(normalizedPrefix)) {
            return folder.path.substring(normalizedPrefix.length);
          }
          return folder.path;
        });

        const result: RepoStructureResult = {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          owner: apiRequest.owner,
          repo: apiRequest.repo,
          path: apiRequest.path || '/',
          files: filePaths,
          folders: folderPaths,
          metadata: {
            branch: apiRequest.branch,
            path: apiRequest.path || '/',
            folders: apiResult.folders,
            summary: apiResult.summary,
            // Always include queryArgs for no-result cases (handled by bulk operations)
            ...(hasResults ? {} : { queryArgs: { ...apiRequest } }),
            searchType: 'success',
          },
        };

        // Summary and queryArgs are handled by the bulk response processor

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          owner: query.owner,
          repo: query.repo,
          path: query.path || '/',
          files: [],
          folders: [],
          error: `Failed to explore repository structure: ${errorMessage}`,
          metadata: {
            queryArgs: { ...query },
            error: `Failed to explore repository structure: ${errorMessage}`,
            searchType: 'api_error',
          },
        };
      }
    }
  );

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    keysPriority: [
      'path',
      'files',
      'folders',
      'error',
      'hints',
      'query',
      'metadata',
    ] satisfies Array<keyof RepoStructureResult>,
  };

  return createBulkResponse(config, results, errors, queries);
}
