import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { executeNpmCommand } from '../../utils/exec';
import { NpmPackageSearchBuilder } from './utils/NpmCommandBuilder';
import { NpmPackage } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ERROR_MESSAGES, getErrorWithSuggestion } from '../errorMessages';
import { getToolSuggestions, TOOL_NAMES } from './utils/toolRelationships';
import { createToolSuggestion } from './utils/validation';
import axios from 'axios';

export const NPM_PACKAGE_SEARCH_TOOL_NAME = 'packageSearch';

const DESCRIPTION = `Search for packages across multiple ecosystems.
Supported: NPM (Node.js) and Python (PyPI) package ecosystems.
Use it to discover packages by functionality keywords and explore alternatives.
Supports concurrent searches across both ecosystems in a single call.

**WHEN TO USE**: Use when users ask questions about npm/python packages or need to discover packages - provides package discovery and ecosystem insights.
Provides comprehensive package data for research and development context.
Example: when content has import statements, use this tool to search for the packages (npm or python).

**KEY CAPABILITIES**:
- npmPackageName: Single NPM package search
- npmPackagesNames: Multiple NPM package searches with concurrent execution
- pythonPackageName: Python package search via PyPI API
- Combined ecosystem searches in a single call with parallel processing
- Results separated by ecosystem (npm: [], python: [])
- Smart package name normalization and fallback strategies
- Repository discovery and metadata extraction

**SEARCH STRATEGY**:
- Use broad functional terms for best discovery
- Single keywords work better than complex phrases
- Multiple searches reveal ecosystem alternatives
- Cross-Ecosystem: Search both NPM and Python to compare alternatives and find best solutions`;

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
          .optional()
          .describe(
            'Search terms for NPM packages only - supports multiple queries (e.g., "react hooks", ["typescript", "eslint"], "data visualization"). Optional when using other parameters.'
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
        npmSearchStrategy: z
          .enum(['individual', 'combined'])
          .optional()
          .default('individual')
          .describe(
            'NPM search strategy: "individual" runs separate searches for each term, "combined" searches all terms together. Default: individual'
          ),
      },
      annotations: {
        title: 'Multi-Ecosystem Package Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: {
      npmPackagesNames?: string | string[];
      npmPackageName?: string;
      pythonPackageName?: string;
      searchLimit?: number;
      npmSearchStrategy?: 'individual' | 'combined';
    }): Promise<CallToolResult> => {
      try {
        // Early parameter validation to avoid expensive operations
        if (
          !args.npmPackagesNames &&
          !args.npmPackageName &&
          !args.pythonPackageName
        ) {
          return createResult({
            error: getErrorWithSuggestion({
              baseError:
                'At least one search parameter must be provided (npmPackagesNames, npmPackageName, or pythonPackageName)',
              suggestion: [
                '• Use npmPackagesNames for multiple NPM package searches',
                '• Use npmPackageName for single NPM package search',
                '• Use pythonPackageName for Python package search',
                '• Can combine npmPackageName and pythonPackageName for both ecosystems',
              ],
            }),
          });
        }

        const queries = (() => {
          if (!args.npmPackagesNames) return [];

          if (Array.isArray(args.npmPackagesNames)) {
            return args.npmPackagesNames.filter(q => q && q.trim());
          }

          const input = args.npmPackagesNames;

          // Handle JSON array strings like "["react", "vue"]"
          if (input.startsWith('[') && input.endsWith(']')) {
            try {
              const parsed = JSON.parse(input);
              if (Array.isArray(parsed)) {
                return parsed.filter(
                  q => q && typeof q === 'string' && q.trim()
                );
              }
            } catch (e) {
              // Fall through to single string handling
            }
          }

          // Handle comma-separated strings
          if (input.includes(',')) {
            return input
              .split(',')
              .map(s => s.trim())
              .filter(s => s);
          }

          // Single string
          return [input];
        })();
        const searchLimit = args.searchLimit || 20;
        const searchStrategy = args.npmSearchStrategy || 'individual';
        const errors: { npm: string[]; python: string[] } = {
          npm: [],
          python: [],
        };

        // Create concurrent search promises
        const searchPromises: Promise<{
          type: 'npm' | 'python';
          packages: NpmPackage[];
          errors: string[];
        }>[] = [];

        // Add Python search promise if specified
        if (args.pythonPackageName) {
          searchPromises.push(
            searchPythonPackage(args.pythonPackageName)
              .then(pythonPackage => ({
                type: 'python' as const,
                packages: pythonPackage ? [pythonPackage] : [],
                errors: pythonPackage
                  ? []
                  : [
                      `Python package '${args.pythonPackageName}' not found on PyPI`,
                    ],
              }))
              .catch(error => {
                const errorMsg =
                  error instanceof Error ? error.message : String(error);
                return {
                  type: 'python' as const,
                  packages: [],
                  errors: [
                    `Python search failed for '${args.pythonPackageName}': ${errorMsg}`,
                  ],
                };
              })
          );
        }

        // Add NPM search promises if specified
        const searchQueries = args.npmPackageName
          ? [args.npmPackageName]
          : queries;

        if (searchQueries.length > 0) {
          if (searchStrategy === 'combined' && searchQueries.length > 1) {
            // Combined search: single search with all terms together
            const combinedQuery = searchQueries.join(' ');
            const builder = new NpmPackageSearchBuilder();
            const fullArgs = builder.build({
              query: combinedQuery,
              searchLimit,
            });

            // Check if builder included base command
            const hasBaseCommand = fullArgs[0] === 'search';
            const command = hasBaseCommand ? fullArgs[0] : 'search';
            const args = hasBaseCommand ? fullArgs.slice(1) : fullArgs;

            searchPromises.push(
              executeNpmCommand(command as 'search', args, { cache: true })
                .then(result => {
                  if (!result.isError && result.content?.[0]?.text) {
                    const packages = parseNpmSearchOutput(
                      result.content[0].text as string
                    );
                    return {
                      type: 'npm' as const,
                      packages,
                      errors:
                        packages.length === 0
                          ? [
                              `NPM search for '${combinedQuery}' returned no results`,
                            ]
                          : [],
                    };
                  } else {
                    const errorContent =
                      result.content?.[0]?.text || 'Unknown NPM error';
                    return {
                      type: 'npm' as const,
                      packages: [],
                      errors: [
                        `NPM combined search failed for '${combinedQuery}': ${errorContent}`,
                      ],
                    };
                  }
                })
                .catch(queryError => {
                  const errorMsg =
                    queryError instanceof Error
                      ? queryError.message
                      : String(queryError);
                  return {
                    type: 'npm' as const,
                    packages: [],
                    errors: [
                      `NPM combined search failed for '${combinedQuery}': ${errorMsg}`,
                    ],
                  };
                })
            );
          } else {
            // Individual searches: run concurrent searches for each term
            const npmSearchPromises = searchQueries.map(query => {
              const builder = new NpmPackageSearchBuilder();
              const fullArgs = builder.build({ query, searchLimit });

              // Check if builder included base command
              const hasBaseCommand = fullArgs[0] === 'search';
              const command = hasBaseCommand ? fullArgs[0] : 'search';
              const args = hasBaseCommand ? fullArgs.slice(1) : fullArgs;

              return executeNpmCommand(command as 'search', args, {
                cache: true,
              })
                .then(result => {
                  if (!result.isError && result.content?.[0]?.text) {
                    const packages = parseNpmSearchOutput(
                      result.content[0].text as string
                    );
                    return {
                      packages,
                      errors:
                        packages.length === 0
                          ? [`NPM package '${query}' not found`]
                          : [],
                    };
                  } else {
                    const errorContent =
                      result.content?.[0]?.text || 'Unknown NPM error';
                    return {
                      packages: [],
                      errors: [
                        `NPM search failed for '${query}': ${errorContent}`,
                      ],
                    };
                  }
                })
                .catch(queryError => {
                  const errorMsg =
                    queryError instanceof Error
                      ? queryError.message
                      : String(queryError);
                  return {
                    packages: [],
                    errors: [`NPM search failed for '${query}': ${errorMsg}`],
                  };
                });
            });

            // Combine all individual NPM search results
            searchPromises.push(
              Promise.all(npmSearchPromises).then(results => {
                const allPackages = results.flatMap(r => r.packages);
                const allErrors = results.flatMap(r => r.errors);
                return {
                  type: 'npm' as const,
                  packages: allPackages,
                  errors: allErrors,
                };
              })
            );
          }
        }

        // Execute all searches concurrently
        const searchResults = await Promise.all(searchPromises);

        // Aggregate results by type
        const npmPackages: NpmPackage[] = [];
        const pythonPackages: NpmPackage[] = [];

        for (const result of searchResults) {
          if (result.type === 'npm') {
            npmPackages.push(...result.packages);
            errors.npm.push(...result.errors);
          } else {
            pythonPackages.push(...result.packages);
            errors.python.push(...result.errors);
          }
        }

        const deduplicatedNpmPackages =
          deduplicatePackagesOptimized(npmPackages);
        const deduplicatedPythonPackages =
          deduplicatePackagesOptimized(pythonPackages);
        const totalCount =
          deduplicatedNpmPackages.length + deduplicatedPythonPackages.length;

        // If we have results, return them (even if there were some errors)
        if (totalCount > 0) {
          const { nextSteps } = getToolSuggestions(TOOL_NAMES.package_search, {
            hasResults: true,
          });

          const hints = [];

          // Add error information if there were failures
          if (errors.npm.length > 0 || errors.python.length > 0) {
            hints.push('Search warnings:');
            errors.npm.forEach(error => hints.push(`• ${error}`));
            errors.python.forEach(error => hints.push(`• ${error}`));
            hints.push('');
          }

          if (nextSteps.length > 0) {
            hints.push('Next steps:');
            nextSteps.forEach(({ tool, reason }) => {
              hints.push(`• Use ${tool} ${reason}`);
            });
          }

          return createResult({
            data: {
              total_count: totalCount,
              npm: deduplicatedNpmPackages,
              python: deduplicatedPythonPackages,
              hints: hints.length > 0 ? hints : undefined,
            },
          });
        }

        // Build detailed error message with ecosystem-specific information
        const errorDetails = [];

        if (errors.npm.length > 0) {
          errorDetails.push('NPM Search Issues:');
          errors.npm.forEach(error => errorDetails.push(`  • ${error}`));
        }

        if (errors.python.length > 0) {
          errorDetails.push('Python Search Issues:');
          errors.python.forEach(error => errorDetails.push(`  • ${error}`));
        }

        // If no specific errors were captured, use generic message
        if (errorDetails.length === 0) {
          const searchedTerms = [];
          if (args.pythonPackageName)
            searchedTerms.push(`Python: '${args.pythonPackageName}'`);
          if (searchQueries.length > 0)
            searchedTerms.push(`NPM: [${searchQueries.join(', ')}]`);
          errorDetails.push(
            `No packages found for: ${searchedTerms.join(', ')}`
          );
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

        // Add ecosystem-specific suggestions
        if (args.pythonPackageName && errors.python.length > 0) {
          fallbackSuggestions.push(
            '• For Python: Try alternative names (e.g., "pillow" instead of "PIL")'
          );
          fallbackSuggestions.push(
            '• For Python: Check exact spelling on https://pypi.org'
          );
          fallbackSuggestions.push(
            'For Python: Use github_search_repos to find repository when PyPI lacks repository info'
          );
          fallbackSuggestions.push(
            'For Python: Search GitHub with package name as topic for alternative sources'
          );
        }

        if (searchQueries.length > 0 && errors.npm.length > 0) {
          fallbackSuggestions.push(
            '• For NPM: Check package availability on https://npmjs.com'
          );
          fallbackSuggestions.push(
            '• For NPM: Try searching with exact package names'
          );
        }

        // Add GitHub integration suggestions
        fallbackSuggestions.push(
          '• Use github_search_repos with topic filters for project discovery'
        );

        if (searchQueries.length > 0) {
          fallbackSuggestions.push(
            '• Check npm registry status: https://status.npmjs.org'
          );
        }

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
            baseError: errorDetails.join('\n'),
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

function deduplicatePackagesOptimized(packages: NpmPackage[]): NpmPackage[] {
  const packageMap = new Map<string, NpmPackage>();

  for (const pkg of packages) {
    if (!packageMap.has(pkg.name)) {
      packageMap.set(pkg.name, pkg);
    }
  }

  return Array.from(packageMap.values());
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
  // Normalize package name for PyPI API (lowercase, underscores to hyphens)
  const normalizedName = packageName.toLowerCase().replace(/_/g, '-');

  // Also try variations with underscores instead of hyphens
  const alternativeNames = [
    normalizedName,
    packageName.toLowerCase(),
    packageName,
    packageName.replace(/-/g, '_').toLowerCase(), // Try underscore version
  ];

  // Remove duplicates while preserving order
  const uniqueNames = [...new Set(alternativeNames)];

  for (const nameToTry of uniqueNames) {
    try {
      // URL encode the package name to handle special characters
      const encodedName = encodeURIComponent(nameToTry);

      // Use axios with proper security headers and timeout
      const response = await axios.get(
        `https://pypi.org/pypi/${encodedName}/json`,
        {
          timeout: 15000,
          headers: {
            'User-Agent': 'octocode-mcp/2.3.21',
            Accept: 'application/json',
          },
          validateStatus: status => status === 200,
        }
      );

      const packageInfo = response.data;

      // Validate response structure
      if (!packageInfo.info || packageInfo.message?.includes('Not Found')) {
        continue;
      }

      const info = packageInfo.info;

      // Extract repository URL with improved logic
      let repositoryUrl: string | null = null;

      // Check multiple possible sources for repository URL
      if (info.project_urls) {
        const urlKeys = [
          'Source',
          'Repository',
          'Homepage',
          'Source Code',
          'GitHub',
          'GitLab',
          'Bitbucket',
        ];
        for (const key of urlKeys) {
          const url = info.project_urls[key];
          if (
            url &&
            (url.includes('github') ||
              url.includes('gitlab') ||
              url.includes('bitbucket'))
          ) {
            repositoryUrl = url;
            break;
          }
        }
      }

      // Fallback to home_page if no repository found
      if (!repositoryUrl && info.home_page) {
        const homeUrl = info.home_page;
        if (
          homeUrl.includes('github') ||
          homeUrl.includes('gitlab') ||
          homeUrl.includes('bitbucket')
        ) {
          repositoryUrl = homeUrl;
        }
      }

      // Parse keywords properly
      let keywords: string[] = [];
      if (info.keywords) {
        if (typeof info.keywords === 'string') {
          keywords = info.keywords
            .split(/[,\s]+/)
            .filter((k: string) => k.trim());
        } else if (Array.isArray(info.keywords)) {
          keywords = info.keywords;
        }
      }

      // Limit keywords to prevent oversized responses
      keywords = keywords.slice(0, MAX_KEYWORDS);

      // Truncate description if too long
      let description = info.summary || info.description || null;
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
      }

      // Return package in NpmPackage format (success - return immediately)
      return {
        name: info.name || packageName,
        version: info.version || 'latest',
        description,
        keywords,
        repository: repositoryUrl,
      };
    } catch (error) {
      // Continue to next name variation
      continue;
    }
  }

  // If we get here, all name variations failed
  return null;
}
