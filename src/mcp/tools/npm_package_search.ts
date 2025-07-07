import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { executeNpmCommand } from '../../utils/exec';
import { NpmPackage } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ERROR_MESSAGES,
  getErrorWithSuggestion,
  createNpmPackageNotFoundError,
} from '../errorMessages';
import { getToolSuggestions, TOOL_NAMES } from './utils/toolRelationships';
import { createToolSuggestion } from './utils/validation';

export const NPM_PACKAGE_SEARCH_TOOL_NAME = 'npmPackageSearch';

const DESCRIPTION = `Search NPM packages using 'npm search' command. Discover packages by functionality keywords and explore alternatives.

CAPABILITIES:
- Package discovery: npm search <term> --json --searchlimit=<n>
- Multiple search terms: searches each term separately and combines results
- Functional keyword search: "testing", "validation", "http client" 
- Repository URL extraction for GitHub integration
- Deduplication and result optimization

SEARCH STRATEGY:
- Use broad functional terms for best discovery
- Single keywords work better than complex phrases
- Multiple searches reveal ecosystem alternatives
- Results include package names, versions, descriptions, and repository links

USAGE EXAMPLES:
- Single search: queries="testing" 
- Multiple searches: queries=["react", "hooks", "typescript"]
- Limit results: searchLimit=10`;

const MAX_DESCRIPTION_LENGTH = 100;
const MAX_KEYWORDS = 10;

export function registerNpmSearchTool(server: McpServer) {
  server.registerTool(
    NPM_PACKAGE_SEARCH_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .union([z.string(), z.array(z.string())])
          .describe(
            'Search terms for NPM packages (e.g., "react hooks", ["typescript", "eslint"], "data visualization"). Use functionality keywords rather than exact package names for best results.'
          ),
        searchLimit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe('Results limit per query (1-50). Default: 20'),
      },
      annotations: {
        title: 'NPM Package Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: {
      queries: string | string[];
      searchLimit?: number;
    }): Promise<CallToolResult> => {
      try {
        const queries = Array.isArray(args.queries)
          ? args.queries
          : [args.queries];
        const searchLimit = args.searchLimit || 20;
        const allPackages: NpmPackage[] = [];

        // Search for each query term
        for (const query of queries) {
          try {
            const result = await executeNpmCommand(
              'search',
              [query, `--searchlimit=${searchLimit}`, '--json'],
              { cache: true }
            );

            if (!result.isError && result.content?.[0]?.text) {
              const packages = parseNpmSearchOutput(
                result.content[0].text as string
              );
              allPackages.push(...packages);
            } else if (result.isError) {
              // Individual query failures are handled silently, continue with others
            }
          } catch (queryError) {
            // Continue with other queries even if one fails
          }
        }

        const deduplicatedPackages = deduplicatePackages(allPackages);

        if (deduplicatedPackages.length > 0) {
          const { nextSteps } = getToolSuggestions(
            TOOL_NAMES.NPM_PACKAGE_SEARCH,
            { hasResults: true }
          );

          const hints = [];
          if (nextSteps.length > 0) {
            hints.push('Next steps:');
            nextSteps.forEach(({ tool, reason }) => {
              hints.push(`• Use ${tool} ${reason}`);
            });
          }

          return createResult({
            data: {
              total_count: deduplicatedPackages.length,
              results: deduplicatedPackages,
              hints: hints.length > 0 ? hints : undefined,
            },
          });
        }

        // Smart fallback suggestions based on query patterns
        const hasSpecificTerms = queries.some(
          q => q.includes('-') || q.includes('@') || q.length > 15
        );

        const hasFrameworkTerms = queries.some(q =>
          ['react', 'vue', 'angular', 'express', 'fastify'].some(fw =>
            q.toLowerCase().includes(fw)
          )
        );

        let fallbackSuggestions = [
          '• Try broader functional terms: "testing" instead of "jest-unit-test"',
          '• Remove version numbers or specific constraints',
          '• Use single keywords: "http" instead of "http-client-library"',
        ];

        if (hasSpecificTerms) {
          fallbackSuggestions = [
            '• Use simpler terms: "validation" instead of "schema-validation-library"',
            '• Try category terms: "database", "testing", "auth"',
            ...fallbackSuggestions.slice(1),
          ];
        }

        if (hasFrameworkTerms) {
          fallbackSuggestions.unshift(
            '• Try specific framework searches: "react hooks", "vue components"'
          );
        }

        // Add GitHub integration suggestions
        fallbackSuggestions.push(
          '• Use github_search_repos with topic filters for project discovery'
        );
        fallbackSuggestions.push(
          '• Check npm registry status: https://status.npmjs.org'
        );

        const { fallback } = getToolSuggestions(TOOL_NAMES.NPM_PACKAGE_SEARCH, {
          errorType: 'no_results',
        });

        const toolSuggestions = createToolSuggestion(
          TOOL_NAMES.NPM_PACKAGE_SEARCH,
          fallback
        );

        return createResult({
          error: getErrorWithSuggestion({
            baseError: createNpmPackageNotFoundError(queries.join(', ')),
            suggestion: [fallbackSuggestions.join('\n'), toolSuggestions],
          }),
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Network/connectivity issues
        if (
          errorMsg.includes('network') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('ENOTFOUND')
        ) {
          const { fallback } = getToolSuggestions(
            TOOL_NAMES.NPM_PACKAGE_SEARCH,
            { hasError: true }
          );

          return createResult({
            error: getErrorWithSuggestion({
              baseError: ERROR_MESSAGES.NPM_CONNECTION_FAILED,
              suggestion: [
                '• Check internet connection and npm registry status',
                '• Try fewer search terms to reduce load',
                '• Retry in a few moments',
                createToolSuggestion(TOOL_NAMES.NPM_PACKAGE_SEARCH, fallback),
              ],
            }),
          });
        }

        // NPM CLI issues
        if (
          errorMsg.includes('command not found') ||
          errorMsg.includes('npm')
        ) {
          const { fallback } = getToolSuggestions(
            TOOL_NAMES.NPM_PACKAGE_SEARCH,
            { hasError: true }
          );

          return createResult({
            error: getErrorWithSuggestion({
              baseError: ERROR_MESSAGES.NPM_CLI_ERROR,
              suggestion: [
                '• Verify NPM installation: npm --version',
                '• Update NPM: npm install -g npm@latest',
                '• Check PATH environment variable',
                createToolSuggestion(TOOL_NAMES.NPM_PACKAGE_SEARCH, fallback),
              ],
            }),
          });
        }

        // Permission/auth issues
        if (
          errorMsg.includes('permission') ||
          errorMsg.includes('403') ||
          errorMsg.includes('401')
        ) {
          const { fallback } = getToolSuggestions(
            TOOL_NAMES.NPM_PACKAGE_SEARCH,
            { errorType: 'access_denied' }
          );

          return createResult({
            error: getErrorWithSuggestion({
              baseError: ERROR_MESSAGES.NPM_PERMISSION_ERROR,
              suggestion: [
                '• Check npm login status: npm whoami',
                '• Use public registry search without auth',
                '• Verify npm registry configuration',
                createToolSuggestion(TOOL_NAMES.NPM_PACKAGE_SEARCH, fallback),
              ],
            }),
          });
        }

        const { fallback } = getToolSuggestions(TOOL_NAMES.NPM_PACKAGE_SEARCH, {
          hasError: true,
        });

        return createResult({
          error: getErrorWithSuggestion({
            baseError: ERROR_MESSAGES.PACKAGE_SEARCH_FAILED,
            suggestion: [
              `Error details: ${errorMsg}`,
              '',
              'Fallback strategies:',
              '• Check npm status and retry',
              '• Use broader search terms',
              createToolSuggestion(TOOL_NAMES.NPM_PACKAGE_SEARCH, fallback),
            ],
          }),
        });
      }
    }
  );
}

function deduplicatePackages(packages: NpmPackage[]): NpmPackage[] {
  const seen = new Set<string>();
  return packages.filter(pkg => {
    if (seen.has(pkg.name)) return false;
    seen.add(pkg.name);
    return true;
  });
}

function normalizePackage(pkg: {
  name?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  links?: { repository?: string };
  repository?: { url?: string };
}): NpmPackage {
  const description = pkg.description || null;
  const truncatedDescription =
    description && description.length > MAX_DESCRIPTION_LENGTH
      ? description.substring(0, MAX_DESCRIPTION_LENGTH) + '...'
      : description;

  const keywords = pkg.keywords || [];
  const limitedKeywords = keywords.slice(0, MAX_KEYWORDS);

  return {
    name: pkg.name || '',
    version: pkg.version || '',
    description: truncatedDescription,
    keywords: limitedKeywords,
    repository: pkg.links?.repository || pkg.repository?.url || null,
  };
}

function parseNpmSearchOutput(output: string): NpmPackage[] {
  try {
    const wrapper = JSON.parse(output);
    const commandResult = wrapper.result;

    let packages: Array<{
      name?: string;
      version?: string;
      description?: string;
      keywords?: string[];
      links?: { repository?: string };
      repository?: { url?: string };
    }> = [];

    // Handle different npm search output formats
    if (Array.isArray(commandResult)) {
      packages = commandResult;
    } else if (commandResult?.objects && Array.isArray(commandResult.objects)) {
      packages = commandResult.objects.map(
        (obj: {
          package?: {
            name?: string;
            version?: string;
            description?: string;
            keywords?: string[];
            links?: { repository?: string };
            repository?: { url?: string };
          };
          [key: string]: unknown;
        }) => obj.package || obj
      );
    } else if (commandResult?.results && Array.isArray(commandResult.results)) {
      packages = commandResult.results;
    }

    return packages.map(normalizePackage);
  } catch (error) {
    return [];
  }
}
