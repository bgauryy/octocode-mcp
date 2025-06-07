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
          'Search query for code. Supports GitHub advanced syntax. see resource "search-github-code-instructions"'
        ),
      owner: z.string().describe('Repository owner/organization'),
      repo: z
        .string()
        .optional()
        .describe('Repository name (often too restrictive)'),
      branch: z
        .string()
        .describe(
          'Branch for workflow documentation (required but not used by CLI)'
        ),
      language: z.string().optional().describe('Programming language filter'),
      filename: z.string().optional().describe('Filename filter'),
      extension: z.string().optional().describe('File extension filter'),
      path: z
        .string()
        .optional()
        .describe('File path filter (directory or path pattern)'),
      in: z
        .enum(['file', 'path', 'file,path'])
        .optional()
        .describe(
          'Search scope: file (contents only), path (file paths only), or file,path (both)'
        ),
      size: z
        .string()
        .optional()
        .describe('File size filter (e.g., ">1000", "<500", "100")'),
      match: z
        .enum(['file', 'path'])
        .optional()
        .describe('Search scope restriction'),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe('Maximum results (default: 50)'),
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
