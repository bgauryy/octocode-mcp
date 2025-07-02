import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { executeNpmCommand } from '../../utils/exec';
import { NpmPackage } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const NPM_PACKAGE_SEARCH_TOOL_NAME = 'npmPackageSearch';

const DESCRIPTION = `Search NPM packages by functionality keywords. PRIMARY ENTRY POINT for package-related queries.

PACKAGE-FIRST STRATEGY:
- Start here when users mention: libraries, dependencies, installations, alternatives
- Use broad functional terms for discovery (not exact package names)
- Bridge to GitHub tools via repository URLs from results

SEARCH APPROACH:
- Single functional terms work best for discovery
- Multiple searches for different aspects/use-cases
- Reveals ecosystem alternatives and quality indicators

INTEGRATION WORKFLOW:
- Package Discovery → Repository Analysis → Implementation Patterns
- npmPackageSearch → npmViewPackage → GitHub repository tools
- Compare alternatives by searching different functional terms`;

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
              // Log individual query failures but continue with others
              console.warn(
                `NPM search failed for query "${query}":`,
                result.content?.[0]?.text
              );
            }
          } catch (queryError) {
            // Continue with other queries even if one fails
            console.warn(`NPM search error for query "${query}":`, queryError);
          }
        }

        const deduplicatedPackages = deduplicatePackages(allPackages);

        if (deduplicatedPackages.length > 0) {
          return createResult({
            data: {
              total_count: deduplicatedPackages.length,
              results: deduplicatedPackages,
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

        return createResult({
          error: `No packages found for queries: ${queries.join(', ')}

Try these alternatives:
${fallbackSuggestions.join('\n')}

Discovery strategies:
• Functional search: "validation", "testing", "charts"
• Ecosystem search: "react", "typescript", "node"
• Use github_search_repos for related projects`,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Network/connectivity issues
        if (
          errorMsg.includes('network') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('ENOTFOUND')
        ) {
          return createResult({
            error: `NPM registry connection failed. Try these alternatives:
• Check internet connection and npm registry status
• Use github_search_repos for package discovery
• Try fewer search terms to reduce load
• Retry in a few moments`,
          });
        }

        // NPM CLI issues
        if (
          errorMsg.includes('command not found') ||
          errorMsg.includes('npm')
        ) {
          return createResult({
            error: `NPM CLI issue detected. Quick fixes:
• Verify NPM installation: npm --version
• Update NPM: npm install -g npm@latest
• Use github_search_repos as alternative for discovery
• Check PATH environment variable`,
          });
        }

        // Permission/auth issues
        if (
          errorMsg.includes('permission') ||
          errorMsg.includes('403') ||
          errorMsg.includes('401')
        ) {
          return createResult({
            error: `NPM permission issue. Try these solutions:
• Check npm login status: npm whoami
• Use public registry search without auth
• Try github_search_repos for public package discovery
• Verify npm registry configuration`,
          });
        }

        return createResult({
          error: `Package search failed: ${errorMsg}

Fallback strategies:
• Use github_search_repos with topic filters
• Try npm view for specific known packages
• Check npm status and retry
• Use broader search terms`,
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
