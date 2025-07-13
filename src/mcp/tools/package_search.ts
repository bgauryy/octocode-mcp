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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const NPM_PACKAGE_SEARCH_TOOL_NAME = 'packageSearch';

const DESCRIPTION = `Search for packages in several languages.
Supported: NPM and Python (PyPI) ecosystems. 
Use it to discover packages by functionality keywords and explore alternatives.

**WHEN TO USE**: Use when users ask questions about npm/python packages or need to discover packages - provides package discovery and ecosystem insights.
This tool provides more data for research and optimize research from user or research context.
Example: when a content has import statements, you can use this tool to search for the packages (npm or python).

**KEY INSIGHTS**:
- Use npmPackageName for NPM packages search
- Use npmPackagesNames for NPM packages search with multiple queries
- Use pythonPackageName for Python packages search
- In case of multiple python queries, call the tool multiple times with the relevant pythonPackageName
- Automatically detects context to suggest appropriate package ecosystem
- Repo discovery by packages search
- Package descriptions, keywords, and version information
- Can be used to understand dependencies better

**SEARCH STRATEGY**:
- Use broad functional terms for best discovery
- Single keywords work better than complex phrases
- Multiple searches reveal ecosystem alternatives
- Combine with npm_view_package for detailed analysis of discovered NPM packages`;

const MAX_DESCRIPTION_LENGTH = 100;
const MAX_KEYWORDS = 10;

export function registerNpmSearchTool(server: McpServer) {
  server.registerTool(
    NPM_PACKAGE_SEARCH_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        npmPackagesNames: z
          .union([z.string(), z.array(z.string())])
          .describe(
            'Search terms for NPM packages only - supports multiple queries (e.g., "react hooks", ["typescript", "eslint"], "data visualization"). Note: Python search only supports single package name via pythonPackageName parameter.'
          ),
        npmPackageName: z
          .string()
          .optional()
          .describe(
            'NPM package name to search for. Use this for searching NPM packages.'
          ),
        pythonPackageName: z
          .string()
          .optional()
          .describe(
            'Python package name to search for. Use this for searching Python packages on PyPI.'
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
      npmPackagesNames: string | string[];
      npmPackageName?: string;
      pythonPackageName?: string;
      searchLimit?: number;
    }): Promise<CallToolResult> => {
      try {
        const queries = Array.isArray(args.npmPackagesNames)
          ? args.npmPackagesNames.filter(q => q && q.trim())
          : args.npmPackagesNames
            ? [args.npmPackagesNames]
            : [];
        const searchLimit = args.searchLimit || 20;
        const allPackages: NpmPackage[] = [];

        // Determine which type of search to perform
        if (args.pythonPackageName) {
          // Search for Python package
          try {
            const pythonPackage = await searchPythonPackage(
              args.pythonPackageName
            );
            if (pythonPackage) {
              allPackages.push(pythonPackage);
            }
          } catch (error) {
            // Handle Python search error below
          }
        } else {
          // Default to NPM search
          const searchQueries = args.npmPackageName
            ? [args.npmPackageName]
            : queries;

          // Search for each query term
          for (const query of searchQueries) {
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
        }

        const deduplicatedPackages = deduplicatePackages(allPackages);

        if (deduplicatedPackages.length > 0) {
          const { nextSteps } = getToolSuggestions(TOOL_NAMES.package_search, {
            hasResults: true,
          });

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
        const hasSpecificTerms =
          queries.length > 0 &&
          queries.some(
            q => q && (q.includes('-') || q.includes('@') || q.length > 15)
          );

        const hasFrameworkTerms =
          queries.length > 0 &&
          queries.some(
            q =>
              q &&
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

        const { fallback } = getToolSuggestions(TOOL_NAMES.package_search, {
          errorType: 'no_results',
        });

        const toolSuggestions = createToolSuggestion(
          TOOL_NAMES.package_search,
          fallback
        );

        // Add package type suggestion
        const packageTypeSuggestion = args.pythonPackageName
          ? '• Try searching with npmPackageName if this is an NPM package'
          : '• Try searching with pythonPackageName if this is a Python package';

        fallbackSuggestions.push(packageTypeSuggestion);

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
          const { fallback } = getToolSuggestions(TOOL_NAMES.package_search, {
            hasError: true,
          });

          return createResult({
            error: getErrorWithSuggestion({
              baseError: ERROR_MESSAGES.NPM_CONNECTION_FAILED,
              suggestion: [
                '• Check internet connection and npm registry status',
                '• Try fewer search terms to reduce load',
                '• Retry in a few moments',
                createToolSuggestion(TOOL_NAMES.package_search, fallback),
              ],
            }),
          });
        }

        // NPM CLI issues
        if (
          errorMsg.includes('command not found') ||
          errorMsg.includes('npm')
        ) {
          const { fallback } = getToolSuggestions(TOOL_NAMES.package_search, {
            hasError: true,
          });

          return createResult({
            error: getErrorWithSuggestion({
              baseError: ERROR_MESSAGES.NPM_CLI_ERROR,
              suggestion: [
                '• Verify NPM installation: npm --version',
                '• Update NPM: npm install -g npm@latest',
                '• Check PATH environment variable',
                createToolSuggestion(TOOL_NAMES.package_search, fallback),
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
          const { fallback } = getToolSuggestions(TOOL_NAMES.package_search, {
            errorType: 'access_denied',
          });

          return createResult({
            error: getErrorWithSuggestion({
              baseError: ERROR_MESSAGES.NPM_PERMISSION_ERROR,
              suggestion: [
                '• Check npm login status: npm whoami',
                '• Use public registry search without auth',
                '• Verify npm registry configuration',
                createToolSuggestion(TOOL_NAMES.package_search, fallback),
              ],
            }),
          });
        }

        const { fallback } = getToolSuggestions(TOOL_NAMES.package_search, {
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
              createToolSuggestion(TOOL_NAMES.package_search, fallback),
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

async function searchPythonPackage(
  packageName: string
): Promise<NpmPackage | null> {
  try {
    // Fetch package info from PyPI
    const { stdout } = await execAsync(
      `curl -s https://pypi.org/pypi/${packageName}/json`
    );

    const packageInfo = JSON.parse(stdout);
    const info = packageInfo.info;

    // Extract GitHub URL from project_urls
    let githubUrl: string | null = null;
    if (info.project_urls) {
      for (const [, url] of Object.entries(info.project_urls)) {
        if (typeof url === 'string' && url.includes('github')) {
          githubUrl = url;
          break;
        }
      }
    }

    // Return package in NpmPackage format
    return {
      name: info.name || packageName,
      version: info.version || 'latest',
      description: info.summary || info.description || null,
      keywords: info.keywords ? info.keywords.split(' ') : [],
      repository: githubUrl,
    };
  } catch (error) {
    return null;
  }
}
