import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github/searchGitHubCode';

// Simplified schema matching official GitHub CLI approach
const searchGitHubCodeSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .describe(
      'Search query for code. Use GitHub search syntax like repo:owner/name, language:javascript, path:*.js, or simple keywords.'
    ),
  owner: z
    .string()
    .optional()
    .describe(
      'Repository owner/organization (e.g., "facebook", "microsoft"). Leave empty for global searches.'
    ),
  repo: z
    .string()
    .optional()
    .describe(
      'Repository name (e.g., "react", "vscode"). Requires owner parameter.'
    ),
  extension: z
    .string()
    .optional()
    .describe('File extension to filter by (e.g., "js", "ts", "py").'),
  filename: z
    .string()
    .optional()
    .describe(
      'Exact filename to search for (e.g., "package.json", "README.md").'
    ),
  language: z
    .string()
    .optional()
    .describe(
      'Programming language to filter by (e.g., "javascript", "typescript", "python").'
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Path pattern to filter by (e.g., "src", "lib", "*.js", "/src/**/*.ts").'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(30)
    .describe('Maximum number of results to return (default: 30, max: 100).'),
  match: z.enum(['file', 'path']).optional().describe('Search scope'),
  branch: z
    .string()
    .optional()
    .describe(
      'Branch for workflow documentation (required but not used by CLI)'
    ),
});

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
    searchGitHubCodeSchema.shape,
    {
      title: 'GitHub Code Search',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCodeSearchParams) => {
      try {
        // Simple validation - only check repo requires owner
        if (args.repo && !args.owner) {
          return {
            content: [
              {
                type: 'text',
                text: 'Repository name requires owner to be specified. Provide both owner and repo parameters.',
              },
            ],
            isError: true,
          };
        }

        return await searchGitHubCode(args);
      } catch (error) {
        // Simplified error handling
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        return {
          content: [
            {
              type: 'text',
              text: `GitHub Code Search Failed: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
