import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { SEARCH_GITHUB_CODE_DESCRIPTION } from './descriptions/search_github_code';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github';

export function registerSearchGitHubCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.SEARCH_GITHUB_CODE,
    SEARCH_GITHUB_CODE_DESCRIPTION,
    {
      query: z
        .string()
        .describe(
          "The search query to find relevant code. You should reuse the user's exact query/most recent message with their wording unless there is a clear reason not to."
        ),
      owner: z
        .string()
        .describe(
          "Filter by repository owner/organization (e.g., 'example-org') get from get_user_organizations tool"
        ),
      repo: z.string().optional().describe('The name of the GitHub repository'),
      extension: z
        .string()
        .optional()
        .describe('Filter by file extension (e.g., "js", "ts", "py")'),
      filename: z
        .string()
        .optional()
        .describe('Filter by filename (e.g., "package.json", "README.md")'),
      language: z
        .string()
        .optional()
        .describe(
          'Filter by programming language (e.g., "javascript", "typescript", "python")'
        ),
      limit: z
        .number()
        .optional()
        .default(30)
        .describe('Maximum number of results to return (default: 30)'),
    },
    {
      title: 'Search GitHub Code',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCodeSearchParams) => {
      try {
        return await searchGitHubCode(args);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to search GitHub code: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
