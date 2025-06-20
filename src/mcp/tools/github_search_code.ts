import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubCodeSearchParams } from '../../types';
import {
  createErrorResult,
  createResult,
  createSuccessResult,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

const TOOL_NAME = 'github_search_code';

const DESCRIPTION = `using "gh search code" to search code in github. prefer to use advanced search syntax (boolean operators - AND NOT OR) since it has proven to be powerful.
Try to be precised in your search query and smart, leveraging the power of boolean operators and filters, along exact  strings query.`;

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAME,
    DESCRIPTION,
    {
      query: z
        .string()
        .min(1)
        .describe(
          'Search query with boolean operators (AND, OR, NOT) and qualifiers. Examples: "react lifecycle", "error handling", "logger AND debug", "config OR settings", "main NOT test". Use quotes for exact phrases. Supports GitHub search syntax.'
        ),
      owner: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          'Repository owner/organization(s). Single string or array for multiple owners. Leave empty for global search.'
        ),
      repo: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          'Specific repositories in "owner/repo" format. Single string or array. Requires owner parameter.'
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
          'Search scope: "file" for content search, "path" for filename/path search. First value used if array provided.'
        ),
    },
    {
      title: TOOL_NAME,
      description: DESCRIPTION,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubCodeSearchParams) => {
      try {
        if (args.repo && !args.owner) {
          return createResult(
            'Repository search requires owner parameter - specify owner when searching specific repositories',
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
        return createErrorResult(
          'GitHub code search failed - check repository access or simplify query',
          error as Error
        );
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
        const repos = Array.isArray(params.repo) ? params.repo : [params.repo];
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
        'Code search command failed - verify GitHub CLI is authenticated',
        error as Error
      );
    }
  });
}
