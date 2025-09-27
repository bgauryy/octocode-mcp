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
  RepoStructureResult,
} from '../scheme/github_view_repo_structure.js';
import { generateHints } from './hints';
import {
  ensureUniqueQueryIds,
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
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            hasResults: false,
            errorMessage: 'Queries array is required and cannot be empty',
            customHints: [
              'Provide at least one repository structure query with owner, repo, and branch',
            ],
          });

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
  const uniqueQueries = ensureUniqueQueryIds(queries, 'repo-structure');
  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (
      query: GitHubViewRepoStructureQuery
    ): Promise<RepoStructureResult> => {
      try {
        // TypeScript and Zod validation ensure all required fields are properly typed
        // No manual validation needed - trust the type system!

        // Create API request with properly typed fields
        const apiRequest: GitHubViewRepoStructureQuery = {
          id: String(query.id),
          reasoning: query.reasoning,
          owner: String(query.owner),
          repo: String(query.repo),
          branch: String(query.branch),
          path: query.path ? String(query.path) : undefined,
          depth: typeof query.depth === 'number' ? query.depth : undefined,
        };

        const apiResult = await viewGitHubRepositoryStructureAPI(
          apiRequest,
          authInfo,
          userContext
        );

        // Check if result is an error
        if ('error' in apiResult) {
          return {
            queryId: String(query.id),
            reasoning: query.reasoning,
            repository: `${query.owner}/${query.repo}`,
            path: query.path || '/',
            files: [],
            folders: [],
            error: apiResult.error,
            hints: [
              'Verify repository owner and name are correct',
              'Check that the branch exists (try "main" or "master")',
              'Ensure you have access to the repository',
            ],
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
          queryId: String(query.id),
          reasoning: query.reasoning,
          repository: `${apiRequest.owner}/${apiRequest.repo}`,
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
          queryId: String(query.id),
          reasoning: query.reasoning,
          repository: `${query.owner}/${query.repo}`,
          path: query.path || '/',
          files: [],
          folders: [],
          error: `Failed to explore repository structure: ${errorMessage}`,
          hints: [
            'Verify repository owner and name are correct',
            'Check that the branch exists (try "main" or "master")',
            'Ensure you have access to the repository',
          ],
          metadata: {
            queryArgs: { ...query },
            error: `Failed to explore repository structure: ${errorMessage}`,
            searchType: 'api_error',
          },
        };
      }
    }
  );

  // Build aggregated context for intelligent hints
  const successfulCount = results.filter(r => !r.result.error).length;
  const failedCount = results.length - successfulCount;
  const aggregatedContext = {
    totalQueries: results.length,
    successfulQueries: successfulCount,
    failedQueries: failedCount,
    foundDirectories: new Set<string>(),
    foundFileTypes: new Set<string>(),
    repositoryContexts: new Set<string>(),
    exploredPaths: new Set<string>(),
    dataQuality: {
      hasResults: successfulCount > 0,
      hasContent: results.some(
        r =>
          !r.result.error &&
          ((Array.isArray(r.result.files) && r.result.files.length > 0) ||
            (Array.isArray(r.result.folders) && r.result.folders.length > 0))
      ),
      hasStructure: results.some(
        r =>
          !r.result.error &&
          ((Array.isArray(r.result.files) && r.result.files.length > 0) ||
            (Array.isArray(r.result.folders) && r.result.folders.length > 0))
      ),
    },
  };

  // Extract context from successful results
  results.forEach(({ result }) => {
    if (!result.error && (result.files || result.folders)) {
      if (result.repository) {
        aggregatedContext.repositoryContexts.add(result.repository);
      }
      if (result.path) {
        aggregatedContext.exploredPaths.add(String(result.path));
      }

      // Extract file types and directories
      if (Array.isArray(result.files)) {
        result.files.forEach((filePath: string) => {
          const extension = filePath.split('.').pop();
          if (extension) {
            aggregatedContext.foundFileTypes.add(extension);
          }

          const directory = filePath.split('/').slice(0, -1).join('/');
          if (directory) {
            aggregatedContext.foundDirectories.add(directory);
          }
        });
      }

      // Add folders directly to foundDirectories
      if (Array.isArray(result.folders)) {
        result.folders.forEach((folderPath: string) => {
          aggregatedContext.foundDirectories.add(folderPath);
        });
      }
    }
  });

  const config: BulkResponseConfig = {
    toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    maxHints: 8,
    keysPriority: [
      'queryId',
      'reasoning',
      'repository',
      'path',
      'files',
      'folders',
    ],
  };

  // Create standardized response - bulk operations handles all hint generation and formatting
  return createBulkResponse(
    config,
    results,
    aggregatedContext,
    errors,
    uniqueQueries
  );
}
