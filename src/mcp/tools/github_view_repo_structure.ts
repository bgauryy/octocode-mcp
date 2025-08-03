import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { viewGitHubRepositoryStructureAPI } from '../../utils/githubAPI';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import {
  GitHubViewRepoStructureQuery,
  GitHubViewRepoStructureQuerySchema,
} from './scheme/github_view_repo_structure';
import { generateToolHints } from './utils/hints';

const DESCRIPTION = `
Explore GitHub repository structure and validate repository access with intelligent navigation.

This tool provides comprehensive repository exploration with smart filtering, error recovery,
and context-aware suggestions. Perfect for understanding project organization, discovering
key files, and validating repository accessibility.

Key Features:
- Comprehensive structure exploration: Navigate directories and understand project layout
- Smart filtering: Focus on relevant files while excluding noise (build artifacts, etc.)
- Access validation: Verify repository existence and permissions
- Research optimization: Tailored hints based on your research goals

Best Practices:
- Start with root directory to understand overall project structure
- Use depth control to balance detail with performance
- Include ignored files only when needed for complete analysis
- Specify research goals for optimized navigation suggestions
`;

export function registerViewGitHubRepoStructureTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    {
      description: DESCRIPTION,
      inputSchema: GitHubViewRepoStructureQuerySchema.shape,
      annotations: {
        title: 'GitHub Repository Structure Explorer',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: GitHubViewRepoStructureQuery): Promise<CallToolResult> => {
        // Validate required parameters
        if (!args.owner?.trim()) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            {
              hasResults: false,
              errorMessage: 'Repository owner is required',
              customHints: [
                'Provide repository owner (organization or username)',
                'Example: owner: "facebook" for Facebook repositories',
              ],
            }
          );

          return createResult({
            isError: true,
            error: 'Repository owner is required',
            hints,
          });
        }

        if (!args.repo?.trim()) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            {
              hasResults: false,
              errorMessage: 'Repository name is required',
              customHints: [
                'Provide repository name',
                'Example: repo: "react" for the React repository',
              ],
            }
          );

          return createResult({
            isError: true,
            error: 'Repository name is required',
            hints,
          });
        }

        if (!args.branch?.trim()) {
          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            {
              hasResults: false,
              errorMessage: 'Branch name is required',
              customHints: [
                'Provide branch name (usually "main" or "master")',
                'Example: branch: "main"',
              ],
            }
          );

          return createResult({
            isError: true,
            error: 'Branch name is required',
            hints,
          });
        }

        try {
          const result = await viewGitHubRepositoryStructureAPI(
            args,
            opts.ghToken
          );

          // Check if result is an error
          if ('error' in result) {
            const hints = generateToolHints(
              TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
              {
                hasResults: false,
                errorMessage: result.error,
                customHints: [],
                researchGoal: args.researchGoal,
              }
            );
            return createResult({
              error: result.error,
              hints,
            });
          }

          // Success - generate intelligent hints
          const totalFiles = Object.values(result.filesByDepth || {}).reduce(
            (acc, files) => acc + files.length,
            0
          );
          const responseContext = {
            foundRepository: `${args.owner}/${args.repo}`,
            foundBranch: args.branch,
            exploredPath: args.path || '/',
            dataQuality: {
              hasContent: totalFiles + (result.folders?.count || 0) > 0,
              hasFiles: totalFiles > 0,
              hasFolders: (result.folders?.count || 0) > 0,
            },
          };

          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            {
              hasResults: responseContext.dataQuality.hasContent,
              totalItems: totalFiles + (result.folders?.count || 0),
              researchGoal: args.researchGoal,
              responseContext,
              queryContext: {
                owner: args.owner,
                repo: args.repo,
              },
            }
          );

          return createResult({
            data: {
              data: {
                ...result,
                apiSource: true,
              },
              meta: {
                repository: `${args.owner}/${args.repo}`,
                branch: args.branch,
                path: args.path || '/',
                depth: args.depth || 1,
                fileCount: totalFiles,
                folderCount: result.folders?.count || 0,
                researchGoal: args.researchGoal,
              },
              hints,
            },
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const hints = generateToolHints(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            {
              hasResults: false,
              errorMessage,
              researchGoal: args.researchGoal,
              customHints: [
                'Verify repository owner and name are correct',
                'Check that the branch exists (try "main" or "master")',
                'Ensure you have access to the repository',
              ],
            }
          );

          return createResult({
            isError: true,
            error: `Failed to explore repository structure: ${errorMessage}`,
            hints,
          });
        }
      }
    )
  );
}
