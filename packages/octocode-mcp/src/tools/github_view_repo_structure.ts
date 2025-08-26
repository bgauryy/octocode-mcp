import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  UserContext,
  withSecurityValidation,
} from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { viewGitHubRepositoryStructureAPI } from '../github/index';
import { TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubViewRepoStructureQuery,
  GitHubViewRepoStructureBulkQuerySchema,
  ProcessedRepositoryStructureResult,
  AggregatedRepositoryContext,
} from '../scheme/github_view_repo_structure';
import { generateHints } from './utils/hints_consolidated';
import {
  ensureUniqueQueryIds,
  processBulkQueries,
  createBulkResponse,
  type BulkResponseConfig,
} from './utils/bulkOperations';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

const DESCRIPTION = `Explore GitHub repository structure and validate repository access with intelligent navigation.

Provides comprehensive repository exploration with smart filtering, error recovery,
and context-aware suggestions. Perfect for understanding project organization, discovering
key files, and validating repository accessibility. Supports bulk operations for efficient
multi-repository analysis.

FEATURES:
- Bulk operations: Explore multiple repositories simultaneously for comparative analysis
- Comprehensive structure exploration: Navigate directories and understand project layout
- Smart filtering: Focus on relevant files while excluding noise (build artifacts, etc.)
- Access validation: Verify repository existence and permissions
- Research optimization: Tailored hints based on research goals

BEST PRACTICES:
- Start with root directory to understand overall project structure
- Use depth control to balance detail with performance
- Include ignored files only when needed for complete analysis
- Specify research goals for optimized navigation suggestions
- Use bulk operations to compare structures across multiple repositories`;

export function registerViewGitHubRepoStructureTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    {
      description: DESCRIPTION,
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
          researchGoal:
            typeof query.researchGoal === 'string'
              ? query.researchGoal
              : undefined,
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

        // Success case - use properly typed apiRequest
        return {
          queryId: String(query.id),
          data: {
            repository: `${apiRequest.owner}/${apiRequest.repo}`,
            structure: apiResult.files.map(file => ({ ...file, type: 'file' })),
            totalCount: apiResult.files.length,
          },
          metadata: {
            branch: apiRequest.branch,
            path: apiRequest.path || '/',
            folders: apiResult.folders,
            summary: apiResult.summary,
            researchGoal: apiRequest.researchGoal,
            queryArgs: { ...apiRequest },
            searchType: 'success',
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          queryId: String(query.id),
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
          Array.isArray(r.result.data?.structure) &&
          r.result.data.structure.length > 0
      ),
      hasStructure: results.some(
        r =>
          !r.result.error &&
          Array.isArray(r.result.data?.structure) &&
          r.result.data.structure.length > 0
      ),
    },
  };

  // Extract context from successful results
  results.forEach(({ result }) => {
    if (!result.error && result.data?.structure) {
      if (result.data.repository) {
        aggregatedContext.repositoryContexts.add(result.data.repository);
      }
      if (result.metadata?.path) {
        aggregatedContext.exploredPaths.add(String(result.metadata.path));
      }

      // Extract file types and directories
      if (Array.isArray(result.data?.structure)) {
        result.data.structure.forEach(file => {
          const extension = file.path.split('.').pop();
          if (extension) {
            aggregatedContext.foundFileTypes.add(extension);
          }

          const directory = file.path.split('/').slice(0, -1).join('/');
          if (directory) {
            aggregatedContext.foundDirectories.add(directory);
          }
        });
      }

      const foldersMeta = result.metadata?.folders as
        | { folders?: Array<{ path: string }> }
        | undefined;
      if (foldersMeta?.folders) {
        foldersMeta.folders.forEach(folder => {
          aggregatedContext.foundDirectories.add(folder.path);
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
    uniqueQueries
  );
}
