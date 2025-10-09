import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  UserContext,
  withSecurityValidation,
} from '../security/withSecurityValidation';
import { viewGitHubRepositoryStructureAPI } from '../github/index';
import { TOOL_NAMES } from '../constants';
import {
  GitHubViewRepoStructureQuery,
  GitHubViewRepoStructureBulkQuerySchema,
  type RepoStructureResult,
} from '../scheme/github_view_repo_structure.js';
import { executeBulkOperation } from '../utils/bulkOperations';
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
        // executeBulkOperation handles empty arrays gracefully
        return exploreMultipleRepositoryStructures(
          args.queries || [],
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
  return executeBulkOperation(
    queries,
    async (query: GitHubViewRepoStructureQuery, _index: number) => {
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
            status: 'error',
            researchGoal: query.researchGoal,
            reasoning: query.reasoning,
            researchSuggestions: query.researchSuggestions,
            owner: query.owner,
            repo: query.repo,
            path: query.path || '/',
            files: [],
            folders: [],
            error: apiResult.error,
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

        const hasContent = filePaths.length > 0 || folderPaths.length > 0;

        return {
          status: hasContent ? 'hasResults' : 'empty',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          owner: apiRequest.owner,
          repo: apiRequest.repo,
          path: apiRequest.path || '/',
          files: filePaths,
          folders: folderPaths,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          status: 'error',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          researchSuggestions: query.researchSuggestions,
          owner: query.owner,
          repo: query.repo,
          path: query.path || '/',
          files: [],
          folders: [],
          error: `Failed to explore repository structure: ${errorMessage}`,
        };
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
