import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { GitHubCodeSearchParams } from '../../types';
import {
  createErrorResult,
  createResult,
  createSuccessResult,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

/**
 * Registers the GitHub Code Search tool with the MCP server.
 *
 * This tool provides semantic code search across GitHub repositories using the GitHub CLI.
 * It supports advanced search features like boolean operators, qualifiers, and filters.
 *
 * Key features:
 * - Boolean operator support (AND, OR, NOT) in queries
 * - GitHub qualifier support (language:, path:, etc.)
 * - Repository, owner, and organization filtering
 * - File type, size, and visibility filtering
 * - Multiple match scopes and filtering options
 */
export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
    {
      query: z
        .string()
        .min(1)
        .describe(
          'Search query with boolean operators (AND, OR, NOT) and qualifiers. ' +
            'Examples: "react lifecycle", "error handling", "logger AND debug", "config OR settings", "main NOT test". ' +
            'Use quotes for exact phrases. Supports GitHub search syntax.'
        ),
      owner: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          'Repository owner/organization(s). Single string or array for multiple owners. Leave empty for global search.'
        ),
      repo: z
        .array(z.string())
        .optional()
        .describe(
          'Specific repositories in "owner/repo" format. Requires owner parameter to be set.'
        ),
      language: z
        .string()
        .optional()
        .describe(
          'Programming language filter (e.g., "javascript", "python", "go").'
        ),
      extension: z
        .string()
        .optional()
        .describe(
          'File extension filter without dot (e.g., "js", "py", "md").'
        ),
      filename: z
        .string()
        .optional()
        .describe(
          'Exact filename filter (e.g., "package.json", "Dockerfile", "README.md").'
        ),
      path: z
        .string()
        .optional()
        .describe(
          'Directory path filter with wildcards (e.g., "src/", "*/tests/*", "docs/**").'
        ),
      size: z
        .string()
        .optional()
        .describe(
          'File size filter in KB with operators (e.g., ">100", "<50", "10..100").'
        ),
      visibility: z
        .enum(['public', 'private', 'internal'])
        .optional()
        .describe(
          'Repository visibility filter. "public" for public repos, "private" for private repos you have access to.'
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(30)
        .describe('Maximum results to return (1-50, default: 30).'),
      match: z
        .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
        .optional()
        .describe(
          'Search scope: "file" for content search, "path" for filename/path search. If array provided, only first value is used due to GitHub API limitations.'
        ),
    },
    {
      title: 'Search Code in GitHub Repositories',
      description:
        'Search code across GitHub with boolean operators (AND, OR, NOT), qualifiers, and filters. ' +
        'Supports language, file type, owner, repository, path, and visibility filtering.',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCodeSearchParams) => {
      try {
        if (args.repo && !args.owner) {
          return createResult(
            'Repository search requires owner parameter',
            true
          );
        }

        const result = await searchGitHubCode(args);

        if (result.isError) {
          return result;
        }

        const execResult = JSON.parse(result.content[0].text as string);
        const codeResults = JSON.parse(execResult.result);

        // GitHub CLI returns a direct array, not an object with total_count and items
        const items = Array.isArray(codeResults) ? codeResults : [];

        return createSuccessResult({
          query: args.query,
          total_count: items.length,
          items: items,
        });
      } catch (error) {
        return createErrorResult('Code search failed', error as Error);
      }
    }
  );
}

async function searchGitHubCode(
  params: GitHubCodeSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const args = ['code'];

      // Build the main query - preserve boolean operators and GitHub syntax
      let query = params.query;

      // Add path filter to query if provided (GitHub search syntax)
      if (params.path) {
        query = `${query} path:${params.path}`;
      }

      // Add visibility filter to query if provided
      if (params.visibility) {
        query = `${query} visibility:${params.visibility}`;
      }

      args.push(query);

      // Add command-line filters
      if (params.language) args.push(`--language=${params.language}`);
      if (params.extension) args.push(`--extension=${params.extension}`);
      if (params.filename) args.push(`--filename=${params.filename}`);
      if (params.size) args.push(`--size=${params.size}`);
      if (params.limit) args.push(`--limit=${params.limit}`);

      // Handle match parameter - can be string or array
      // Note: GitHub search API doesn't support multiple match types in a single query
      if (params.match) {
        const matchValues = Array.isArray(params.match)
          ? params.match
          : [params.match];

        // GitHub API limitation: can't use both in:file and in:path in same query
        // Use the first match type when multiple are provided
        const matchValue = matchValues[0];
        args.push(`--match=${matchValue}`);
      }

      // Handle owner parameter - can be string or array
      if (params.owner && !params.repo) {
        const ownerValues = Array.isArray(params.owner)
          ? params.owner
          : [params.owner];
        ownerValues.forEach(owner => args.push(`--owner=${owner}`));
      }

      // Handle repository filters
      if (params.owner && params.repo) {
        const owners = Array.isArray(params.owner)
          ? params.owner
          : [params.owner];
        const repos = params.repo;
        // Create repo filters for each owner/repo combination
        owners.forEach(owner => {
          repos.forEach(repo => {
            // Handle both "owner/repo" format and just "repo" format
            if (repo.includes('/')) {
              args.push(`--repo=${repo}`);
            } else {
              args.push(`--repo=${owner}/${repo}`);
            }
          });
        });
      }

      // JSON output with all available fields
      args.push('--json=repository,path,textMatches,sha,url');

      const result = await executeGitHubCommand('search', args, {
        cache: false,
      });

      return result;
    } catch (error) {
      return createErrorResult(
        'Failed to execute search command',
        error as Error
      );
    }
  });
}
