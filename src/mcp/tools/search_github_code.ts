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
          'Search query for code. Will automatically add repo:owner/repository qualifier for repository-specific search. Supports GitHub advanced syntax including qualifiers, boolean operations, and multi-word searches.'
        ),
      owner: z
        .string()
        .describe(
          'Repository owner/organization (REQUIRED). Used to construct repo:owner/repository qualifier for repository-specific search.'
        ),
      repo: z
        .string()
        .describe(
          'Repository name (REQUIRED). Used with owner to construct repo:owner/repository qualifier for repository-specific search.'
        ),
      language: z
        .string()
        .optional()
        .describe(
          'Filter by programming language (e.g., "javascript", "typescript", "python")'
        ),
      filename: z
        .string()
        .optional()
        .describe('Filter by filename (e.g., "package.json", "README.md")'),
      extension: z
        .string()
        .optional()
        .describe('Filter by file extension (e.g., "js", "ts", "py")'),
      limit: z
        .number()
        .optional()
        .default(30)
        .describe('Maximum number of results to return (default: 30)'),
    },
    async args => {
      const params: GitHubCodeSearchParams = {
        query: args.query,
        owner: args.owner,
        repo: args.repo,
        language: args.language,
        filename: args.filename,
        extension: args.extension,
        limit: args.limit,
      };

      return await searchGitHubCode(params);
    }
  );
}
