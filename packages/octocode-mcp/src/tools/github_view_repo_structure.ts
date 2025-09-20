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
  ProcessedRepositoryStructureResult,
  AggregatedRepositoryContext,
} from '../scheme/github_view_repo_structure';
import { generateHints } from './hints';
import {
  ensureUniqueQueryIds,
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
} from '../utils/bulkOperations';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';
import { DESCRIPTIONS } from './descriptions';

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
          verbose?: boolean;
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
            isError: true,
            error: 'Queries array is required and cannot be empty',
            hints,
          });
        }

        if (args.queries.length > 5) {
          const hints = generateHints({
            toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            hasResults: false,
            errorMessage: 'Too many queries provided',
            customHints: [
              'Limit to 5 repository structure queries per request for optimal performance',
            ],
          });

          return createResult({
            isError: true,
            error: 'Maximum 5 queries allowed per request',
            hints,
          });
        }

        return exploreMultipleRepositoryStructures(
          args.queries,
          args.verbose || false,
          authInfo,
          userContext
        );
      }
    )
  );
}

async function exploreMultipleRepositoryStructures(
  queries: GitHubViewRepoStructureQuery[],
  verbose: boolean = false,
  authInfo?: AuthInfo,
  userContext?: UserContext
): Promise<CallToolResult> {
  const uniqueQueries = ensureUniqueQueryIds(queries, 'repo-structure');
  const { results, errors } = await processBulkQueries(
    uniqueQueries,
    async (
      query: GitHubViewRepoStructureQuery
    ): Promise<ProcessedRepositoryStructureResult> => {
      try {
        // TypeScript and Zod validation ensure all required fields are properly typed
        // No manual validation needed - trust the type system!

        // Create API request with properly typed fields
        const apiRequest: GitHubViewRepoStructureQuery = {
          id: String(query.id),
          verbose: query.verbose,
          owner: String(query.owner),
          repo: String(query.repo),
          branch: String(query.branch),
          path: query.path ? String(query.path) : undefined,
          depth: typeof query.depth === 'number' ? query.depth : undefined,
          includeIgnored:
            typeof query.includeIgnored === 'boolean'
              ? query.includeIgnored
              : undefined,
          showMedia:
            typeof query.showMedia === 'boolean' ? query.showMedia : undefined,
        };

        const apiResult = await viewGitHubRepositoryStructureAPI(
          apiRequest,
          authInfo,
          userContext
        );

        // Check if result is an error
        if ('error' in apiResult) {
          return {
            error: apiResult.error,
            hints: [
              'Verify repository owner and name are correct',
              'Check that the branch exists (try "main" or "master")',
              'Ensure you have access to the repository',
            ],
            metadata: {
              queryArgs: { ...query },
              error: apiResult.error,
              searchType: 'api_error',
            },
          };
        }

        // Success case - use simplified structure
        const hasResults = apiResult.files && apiResult.files.length > 0;

        // Extract file paths and folder paths separately
        const filePaths = apiResult.files.map(file => file.path);
        const folderPaths = (apiResult.folders?.folders || []).map(
          folder => folder.path
        );

        const result: ProcessedRepositoryStructureResult = {
          queryId: String(query.id),
          queryDescription: query.queryDescription,
          repository: `${apiRequest.owner}/${apiRequest.repo}`,
          branch: apiRequest.branch,
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

        // Add summary and queryArgs to top level only if verbose (handled by bulk operations)
        // These will be conditionally included by the bulk response processor

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
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
  const aggregatedContext: AggregatedRepositoryContext = {
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
    includeAggregatedContext: verbose,
    includeErrors: true,
    maxHints: 8,
  };

  return createBulkResponse(
    config,
    results,
    aggregatedContext,
    errors,
    uniqueQueries,
    verbose
  );
}
