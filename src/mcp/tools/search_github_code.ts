import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github/searchGitHubCode';

// Simple query enhancement for better results
function enhanceQuery(query: string): string[] {
  const enhanced: string[] = [query];

  // Remove unsupported syntax
  const cleaned = query.replace(/[()]/g, '').trim();
  if (cleaned !== query) {
    enhanced.push(cleaned);
  }

  // Add simple boolean variations if no operators present
  const hasBoolean = /\b(OR|AND|NOT)\b/i.test(query);
  if (!hasBoolean && query.split(' ').length <= 3) {
    const terms = query.split(' ').filter(t => t.length > 2);
    if (terms.length === 2) {
      enhanced.push(`${terms[0]} OR ${terms[1]}`);
      enhanced.push(`${terms[0]} AND ${terms[1]} NOT test`);
    } else if (terms.length === 1) {
      enhanced.push(`${terms[0]} NOT test NOT mock`);
    }
  }

  return [...new Set(enhanced)];
}

// Apply intelligence from other tools
function applyIntelligence(
  args: GitHubCodeSearchParams,
  intelligence?: any
): GitHubCodeSearchParams {
  if (!intelligence) return args;

  // Apply NPM intelligence if available
  if (intelligence.searchTargets) {
    // Use API keywords to enhance search
    if (
      intelligence.searchTargets.apiKeywords &&
      intelligence.searchTargets.apiKeywords.length > 0
    ) {
      const keyword = intelligence.searchTargets.apiKeywords[0];
      if (!args.query.includes(keyword)) {
        args.query = `${args.query} ${keyword}`;
      }
    }

    // Target specific paths if we have module info
    if (intelligence.searchTargets.entryFiles && !args.path) {
      args.path = 'src';
    }
  }

  // Apply package context
  if (intelligence.analysisContext) {
    // Focus on relevant file types
    if (intelligence.analysisContext.hasTypeSupport && !args.extension) {
      args.extension = 'ts';
    }
  }

  return args;
}

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
    {
      query: z
        .string()
        .min(1, 'Query cannot be empty')
        .describe(
          'Search query for code. Use GitHub search syntax like repo:owner/name, language:python, path:src/, or simple keywords. Boolean operators (OR, AND, NOT) are highly recommended for better results.'
        ),
      owner: z
        .string()
        .optional()
        .describe(
          'Repository owner/organization (e.g., "facebook", "microsoft"). Leave empty for global searches.'
        ),
      repo: z
        .array(z.string())
        .optional()
        .describe(
          'Repository names (e.g., ["library", "framework"]). Requires owner parameter.'
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
          'Programming language to filter by (e.g., "python", "rust", "go", "java").'
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
        .describe(
          'Maximum number of results to return (default: 30, max: 100).'
        ),
      match: z.enum(['file', 'path']).optional().describe('Search scope'),
      branch: z
        .string()
        .optional()
        .describe(
          'Branch for workflow documentation (required but not used by CLI)'
        ),
      size: z
        .string()
        .optional()
        .describe(
          'Filter on file size range, in kilobytes (e.g., ">1", "<50")'
        ),
      enableQueryOptimization: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'Enable automatic query optimization with boolean operators for better results (default: true)'
        ),
      // Context from other tools (for smart search)
      intelligence: z
        .any()
        .optional()
        .describe('Intelligence context from other tools (e.g., NPM exports)'),
    },
    {
      title: 'GitHub Code Search',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (
      args: GitHubCodeSearchParams & {
        enableQueryOptimization?: boolean;
        intelligence?: any;
      }
    ) => {
      try {
        // Validation
        if (args.repo && !args.owner) {
          return {
            content: [
              {
                type: 'text',
                text: 'Repository name requires owner parameter.',
              },
            ],
            isError: true,
          };
        }

        // Apply intelligence from other tools
        const smartArgs = applyIntelligence(args, args.intelligence);

        // Try enhanced queries
        const queryVariations =
          args.enableQueryOptimization !== false
            ? enhanceQuery(smartArgs.query)
            : [smartArgs.query];

        let result: any = null;
        let usedQuery = smartArgs.query;

        // Try queries in order of preference
        for (const query of queryVariations) {
          try {
            const testArgs = { ...smartArgs, query };
            const testResult = await searchGitHubCode(testArgs);

            if (testResult.content && testResult.content[0]) {
              // Validate JSON response
              try {
                JSON.parse(testResult.content[0].text as string);
                result = testResult;
                usedQuery = query;
                break;
              } catch {
                continue;
              }
            }
          } catch {
            continue;
          }
        }

        if (!result) {
          return {
            content: [
              {
                type: 'text',
                text: `Search failed. Try:\n• Simpler terms\n• Boolean operators: "term1 OR term2"\n• Specific paths: path:src/\n• Exclude tests: "term NOT test"`,
              },
            ],
            isError: true,
          };
        }

        // Enhance response with concise context
        if (result.content && result.content[0]) {
          let responseText = result.content[0].text as string;

          // Add transformation note if query was modified
          if (usedQuery !== args.query) {
            responseText += `\n\nQuery optimized: "${args.query}" → "${usedQuery}"`;
          }

          // Add intelligence context if used
          if (args.intelligence?.searchTargets) {
            responseText += `\nApplied package intelligence for targeted search`;
          }

          return {
            content: [
              {
                type: 'text',
                text: responseText,
              },
            ],
            isError: false,
          };
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `GitHub Code Search failed: ${errorMessage}\n\nSuggestions:\n• Simplify query terms\n• Use OR/AND/NOT operators\n• Try path filters: path:src/\n• Check repository access`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
