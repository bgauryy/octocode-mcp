import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  createResult,
  toDDMMYYYY,
  humanizeBytes,
  simplifyRepoUrl,
} from '../responses';
import { executeNpmCommand } from '../../utils/exec';
import {
  NpmPackageSearchBuilder,
  NpmPackageViewBuilder,
} from './utils/NpmCommandBuilder';
import {
  NpmPackage,
  EnhancedPackageSearchResult,
  EnhancedPackageMetadata,
  OptimizedNpmPackageResult,
  PythonPackageMetadata,
  PackageSearchWithMetadataParams,
  PackageSearchBulkParams,
  NpmPackageQuery,
  PythonPackageQuery,
} from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ERROR_MESSAGES } from '../errorMessages';
import {
  generateSmartHints,
  getToolSuggestions,
  getResearchGoalHints,
} from './utils/toolRelationships';
import { createToolSuggestion } from './utils/validation';
import { generateCacheKey, withCache } from '../../utils/cache';
import {
  TOOL_NAMES,
  ToolOptions,
  ResearchGoalEnum,
} from './utils/toolConstants';
import axios from 'axios';

const MAX_DESCRIPTION_LENGTH = 100;
const MAX_KEYWORDS = 10;

export function registerNpmSearchTool(
  server: McpServer,
  options?: ToolOptions
) {
  const npmEnabled = options?.npmEnabled ?? true;

  const baseDescription = `PURPOSE: Efficiently discover and analyze packages across ${npmEnabled ? 'NPM and Python' : 'Python'} ecosystems with metadata and repository links.

WHEN TO USE
  ${npmEnabled ? 'Prefer using this tool to get repository URLs first before using GitHub tools.' : ''}
  Need to know more data about ${npmEnabled ? 'npm/python' : 'python'} packages (by name, imports, or code or context)
  Need package metadata: versions, dependencies, exports, repository URLs
  Analyzing project dependencies or exploring alternatives
  ${npmEnabled ? 'Helping GitHub tools - get repository URLs first' : ''}

 HINT:
  Not all results are guaranteed to be correct, so you should always verify the results

INTEGRATION: Essential first step before GitHub repository exploration or while exploring github code - provides repository URLs and package context for deeper code analysis.`;

  // Build input schema based on NPM availability
  const inputSchema: any = {
    pythonPackages: z
      .array(
        z.object({
          name: z.string().describe('Python package name to search for'),
          searchLimit: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe(
              'Results limit for this query (1-10). Default: 1 for specific packages, up to 10 for exploration'
            ),
          id: z
            .string()
            .optional()
            .describe('Optional identifier for this query'),
        })
      )
      .max(10)
      .optional()
      .describe(
        'Array of Python package queries (max 10). Each query searches PyPI for the specified package name with individual result limits.'
      ),
    // Global defaults (can be overridden per query)
    searchLimit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(1)
      .describe(
        'Global default results limit per query (1-10). Use 1 for specific packages, up to 10 for exploration. Can be overridden per query. Default: 1'
      ),
  };

  // Add NPM-related schema only if NPM is enabled
  if (npmEnabled) {
    inputSchema.npmPackages = z
      .array(
        z.object({
          name: z.string().describe('NPM package name to search for'),
          searchLimit: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe(
              'Results limit for this query (1-10). Default: 1 for specific packages, up to 10 for exploration'
            ),
          npmSearchStrategy: z
            .enum(['individual', 'combined'])
            .optional()
            .describe('Search strategy for this query'),
          npmFetchMetadata: z
            .boolean()
            .optional()
            .describe('Whether to fetch detailed metadata for this package'),
          npmField: z
            .string()
            .optional()
            .describe('Specific field to retrieve from this NPM package'),
          npmMatch: z
            .union([
              z.enum([
                'version',
                'description',
                'license',
                'author',
                'homepage',
                'repository',
                'dependencies',
                'devDependencies',
                'keywords',
                'main',
                'scripts',
                'engines',
                'files',
                'publishConfig',
                'dist-tags',
                'time',
              ]),
              z.array(
                z.enum([
                  'version',
                  'description',
                  'license',
                  'author',
                  'homepage',
                  'repository',
                  'dependencies',
                  'devDependencies',
                  'keywords',
                  'main',
                  'scripts',
                  'engines',
                  'files',
                  'publishConfig',
                  'dist-tags',
                  'time',
                ])
              ),
              z.string().refine(
                val => {
                  const validFields = [
                    'version',
                    'description',
                    'license',
                    'author',
                    'homepage',
                    'repository',
                    'dependencies',
                    'devDependencies',
                    'keywords',
                    'main',
                    'scripts',
                    'engines',
                    'files',
                    'publishConfig',
                    'dist-tags',
                    'time',
                  ];
                  if (validFields.includes(val)) return true;
                  if (val.startsWith('[') && val.endsWith(']')) {
                    try {
                      const parsed = JSON.parse(val);
                      return (
                        Array.isArray(parsed) &&
                        parsed.length > 0 &&
                        parsed.every(
                          field =>
                            typeof field === 'string' &&
                            validFields.includes(field)
                        )
                      );
                    } catch {
                      return false;
                    }
                  }
                  return false;
                },
                { message: 'Invalid field name or JSON array format' }
              ),
            ])
            .optional()
            .describe('Specific field(s) to retrieve from this NPM package'),
          id: z
            .string()
            .optional()
            .describe('Optional identifier for this query'),
        })
      )
      .max(10)
      .optional()
      .describe(
        'Array of NPM package queries (max 10). Each query can have individual parameters for customized search behavior.'
      );

    inputSchema.npmSearchStrategy = z
      .enum(['individual', 'combined'])
      .optional()
      .default('individual')
      .describe(
        'Global default NPM search strategy. Can be overridden per query. Default: individual'
      );

    inputSchema.npmFetchMetadata = z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Global default for NPM metadata fetching. Can be overridden per query. Default: false'
      );

    // Legacy parameters for backward compatibility (deprecated)
    inputSchema.npmPackagesNames = z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'DEPRECATED: Use npmPackages array instead. Search terms for NPM packages - supports multiple queries.'
      );

    inputSchema.npmPackageName = z
      .string()
      .optional()
      .describe(
        'DEPRECATED: Use npmPackages array instead. NPM package name to search for.'
      );

    inputSchema.npmField = z
      .string()
      .optional()
      .describe(
        'DEPRECATED: Use npmPackages with per-query npmField instead. Optional field for NPM packages.'
      );

    inputSchema.npmMatch = z
      .union([
        z.enum([
          'version',
          'description',
          'license',
          'author',
          'homepage',
          'repository',
          'dependencies',
          'devDependencies',
          'keywords',
          'main',
          'scripts',
          'engines',
          'files',
          'publishConfig',
          'dist-tags',
          'time',
        ]),
        z.array(
          z.enum([
            'version',
            'description',
            'license',
            'author',
            'homepage',
            'repository',
            'dependencies',
            'devDependencies',
            'keywords',
            'main',
            'scripts',
            'engines',
            'files',
            'publishConfig',
            'dist-tags',
            'time',
          ])
        ),
        z.string().refine(
          val => {
            const validFields = [
              'version',
              'description',
              'license',
              'author',
              'homepage',
              'repository',
              'dependencies',
              'devDependencies',
              'keywords',
              'main',
              'scripts',
              'engines',
              'files',
              'publishConfig',
              'dist-tags',
              'time',
            ];
            if (validFields.includes(val)) return true;
            if (val.startsWith('[') && val.endsWith(']')) {
              try {
                const parsed = JSON.parse(val);
                return (
                  Array.isArray(parsed) &&
                  parsed.length > 0 &&
                  parsed.every(
                    field =>
                      typeof field === 'string' && validFields.includes(field)
                  )
                );
              } catch {
                return false;
              }
            }
            return false;
          },
          { message: 'Invalid field name or JSON array format' }
        ),
      ])
      .optional()
      .describe(
        'DEPRECATED: Use npmPackages with per-query npmMatch instead. Specific field(s) to retrieve from NPM packages.'
      );
  }

  // Legacy Python parameter for backward compatibility
  inputSchema.pythonPackageName = z
    .string()
    .optional()
    .describe(
      'DEPRECATED: Use pythonPackages array instead. Python package name to search for.'
    );

  // Research goal for guiding hints
  inputSchema.researchGoal = z
    .enum(ResearchGoalEnum)
    .optional()
    .describe('Research goal to guide tool behavior and hint generation');

  server.registerTool(
    TOOL_NAMES.PACKAGE_SEARCH,
    {
      description: baseDescription,
      inputSchema,
      annotations: {
        title: npmEnabled
          ? 'Multi-Ecosystem Package Search with Bulk Queries'
          : 'Python Package Search with Bulk Queries',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (
      args: PackageSearchBulkParams & PackageSearchWithMetadataParams
    ): Promise<CallToolResult> => {
      try {
        // Early NPM check - if NPM is disabled but NPM parameters are provided, return error
        if (!npmEnabled) {
          const hasNpmParams = !!(
            args.npmPackages ||
            args.npmPackagesNames ||
            args.npmPackageName ||
            args.npmField ||
            args.npmMatch ||
            args.npmSearchStrategy ||
            args.npmFetchMetadata
          );

          if (hasNpmParams) {
            const hints = generateSmartHints(TOOL_NAMES.PACKAGE_SEARCH, {
              hasResults: false,
              errorMessage: 'NPM functionality is not available',
              customHints: [
                'NPM is not installed or not accessible on this system',
                'Only Python package search is available',
                'Use pythonPackages[] or pythonPackageName parameters instead',
              ],
            });
            return createResult({
              isError: true,
              hints,
            });
          }
        }

        // Detect if using new bulk format or legacy format
        const isUsingBulkFormat = !!(args.npmPackages || args.pythonPackages);
        const isUsingLegacyFormat = !!(
          args.npmPackagesNames ||
          args.npmPackageName ||
          args.pythonPackageName
        );

        // Early parameter validation
        if (!isUsingBulkFormat && !isUsingLegacyFormat) {
          const availableParams = npmEnabled
            ? [
                'npmPackages[]',
                'pythonPackages[]',
                'or legacy npmPackageName/pythonPackageName',
              ]
            : ['pythonPackages[]', 'or legacy pythonPackageName'];

          const hints = generateSmartHints(TOOL_NAMES.PACKAGE_SEARCH, {
            hasResults: false,
            errorMessage: 'No search parameters provided',
            customHints: [`Use ${availableParams.join(', ')}`],
          });
          return createResult({
            isError: true,
            hints,
          });
        }

        // Normalize parameters to bulk format
        let normalizedNpmQueries: NpmPackageQuery[] = [];
        let normalizedPythonQueries: PythonPackageQuery[] = [];

        if (isUsingBulkFormat) {
          // Use new bulk format directly
          normalizedNpmQueries = npmEnabled ? args.npmPackages || [] : [];
          normalizedPythonQueries = args.pythonPackages || [];
        } else {
          // Convert legacy format to bulk format for consistent processing
          if (npmEnabled && args.npmPackageName) {
            normalizedNpmQueries.push({
              name: args.npmPackageName,
              searchLimit: args.searchLimit,
              npmSearchStrategy: args.npmSearchStrategy,
              npmFetchMetadata: args.npmFetchMetadata,
              npmField: args.npmField,
              npmMatch: args.npmMatch,
              id: 'legacy-single',
            });
          }

          if (npmEnabled && args.npmPackagesNames) {
            const queries = (() => {
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

            // Handle combined vs individual strategy for legacy npmPackagesNames
            if (args.npmSearchStrategy === 'combined' && queries.length > 1) {
              // Combined search: join all terms into single query
              normalizedNpmQueries.push({
                name: queries.join(' '),
                searchLimit: args.searchLimit,
                npmSearchStrategy: args.npmSearchStrategy,
                npmFetchMetadata: args.npmFetchMetadata,
                npmField: args.npmField,
                npmMatch: args.npmMatch,
                id: 'legacy-combined',
              });
            } else {
              // Individual searches: create separate query for each term
              queries.forEach((name, index) => {
                normalizedNpmQueries.push({
                  name,
                  searchLimit: args.searchLimit,
                  npmSearchStrategy: args.npmSearchStrategy,
                  npmFetchMetadata: args.npmFetchMetadata,
                  npmField: args.npmField,
                  npmMatch: args.npmMatch,
                  id: `legacy-multi-${index}`,
                });
              });
            }
          }

          if (args.pythonPackageName) {
            normalizedPythonQueries.push({
              name: args.pythonPackageName,
              id: 'legacy-python',
            });
          }
        }

        // Apply global defaults to queries that don't have specific values
        const globalDefaults = {
          searchLimit: args.searchLimit || 1,
          npmSearchStrategy: args.npmSearchStrategy || 'individual',
          npmFetchMetadata: args.npmFetchMetadata || false,
        };

        if (npmEnabled) {
          normalizedNpmQueries = normalizedNpmQueries.map(query => ({
            ...query,
            searchLimit: query.searchLimit ?? globalDefaults.searchLimit,
            npmSearchStrategy:
              query.npmSearchStrategy ?? globalDefaults.npmSearchStrategy,
            npmFetchMetadata:
              query.npmFetchMetadata ?? globalDefaults.npmFetchMetadata,
          }));
        }

        normalizedPythonQueries = normalizedPythonQueries.map(query => ({
          ...query,
          searchLimit: query.searchLimit ?? globalDefaults.searchLimit,
        }));

        if (
          normalizedNpmQueries.length === 0 &&
          normalizedPythonQueries.length === 0
        ) {
          const hints = generateSmartHints(TOOL_NAMES.PACKAGE_SEARCH, {
            hasResults: false,
            errorMessage:
              'No valid package queries found after processing parameters',
            customHints: [
              'Ensure package names are not empty strings',
              'Check array format for bulk queries',
              npmEnabled
                ? 'Verify at least one npmPackages or pythonPackages query is provided'
                : 'Verify at least one pythonPackages query is provided',
            ],
          });
          return createResult({
            isError: true,
            hints,
            error: true,
          });
        }

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
        if (normalizedPythonQueries.length > 0) {
          const pythonSearchPromises = normalizedPythonQueries.map(query => {
            return searchPythonPackage(query.name)
              .then(pythonPackage => ({
                type: 'python' as const,
                packages: pythonPackage ? [pythonPackage] : [],
                errors: pythonPackage
                  ? []
                  : [`Python package '${query.name}' not found on PyPI`],
              }))
              .catch(error => {
                const errorMsg =
                  error instanceof Error ? error.message : String(error);
                return {
                  type: 'python' as const,
                  packages: [],
                  errors: [
                    `Python search failed for '${query.name}': ${errorMsg}`,
                  ],
                };
              });
          });

          searchPromises.push(
            Promise.all(pythonSearchPromises).then(results => {
              const allPackages = results.flatMap(r => r.packages);
              const allErrors = results.flatMap(r => r.errors);
              return {
                type: 'python' as const,
                packages: allPackages,
                errors: allErrors,
              };
            })
          );
        }

        // Add NPM search promises if specified and NPM is enabled
        if (npmEnabled && normalizedNpmQueries.length > 0) {
          const npmSearchPromises = normalizedNpmQueries.map(query => {
            const builder = new NpmPackageSearchBuilder();
            const fullArgs = builder.build({
              query: query.name,
              searchLimit: query.searchLimit,
            });

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
                    type: 'npm' as const,
                    packages,
                    errors:
                      packages.length === 0
                        ? [`NPM package '${query.name}' not found`]
                        : [],
                  };
                } else {
                  const errorContent =
                    result.content?.[0]?.text || 'Unknown NPM error';
                  return {
                    type: 'npm' as const,
                    packages: [],
                    errors: [
                      `NPM search failed for '${query.name}': ${errorContent}`,
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
                    `NPM search failed for '${query.name}': ${errorMsg}`,
                  ],
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

        // If we have results, process them based on requested format
        if (totalCount > 0) {
          // Build custom hints for errors if any
          const customHints = [];
          if (errors.npm.length > 0 || errors.python.length > 0) {
            customHints.push('Search had some errors:');
            errors.npm.forEach(error => customHints.push(`NPM: ${error}`));
            errors.python.forEach(error =>
              customHints.push(`Python: ${error}`)
            );
          }

          const hints = generateSmartHints(TOOL_NAMES.PACKAGE_SEARCH, {
            hasResults: true,
            totalItems: totalCount,
            customHints,
          });

          // Add research goal hints if we have successful results
          if (args.researchGoal && totalCount > 0) {
            const goalHints = getResearchGoalHints(
              TOOL_NAMES.PACKAGE_SEARCH,
              args.researchGoal
            );
            hints.push(...goalHints);
          }

          // Check if enhanced metadata fetching is requested for NPM packages
          if (
            npmEnabled &&
            normalizedNpmQueries.some(q => q.npmFetchMetadata) &&
            deduplicatedNpmPackages.length > 0
          ) {
            try {
              // Fetch detailed metadata for npm packages concurrently
              const npmMetadataPromises = deduplicatedNpmPackages.map(
                async (
                  pkg
                ): Promise<{
                  packageName: string;
                  metadata: EnhancedPackageMetadata | null;
                  error?: string;
                }> => {
                  try {
                    const metadataResult = await viewNpmPackage(
                      pkg.name,
                      normalizedNpmQueries.find(q => q.name === pkg.name)
                        ?.npmField,
                      normalizedNpmQueries.find(q => q.name === pkg.name)
                        ?.npmMatch
                    );

                    if (metadataResult.isError) {
                      return {
                        packageName: pkg.name,
                        metadata: null,
                        error: metadataResult.content[0]?.text as string,
                      };
                    }

                    // Parse the npm view result
                    const execResult = JSON.parse(
                      metadataResult.content[0].text as string
                    );
                    let packageData;

                    // Handle different response formats based on field/match parameters
                    const queryConfig = normalizedNpmQueries.find(
                      q => q.name === pkg.name
                    );
                    if (queryConfig?.npmField) {
                      // Field-specific response
                      packageData = {
                        name: pkg.name,
                        [queryConfig.npmField]: execResult.result,
                        // Include basic info from original search
                        version: pkg.version,
                        description: pkg.description,
                        repository: pkg.repository,
                      };
                    } else if (queryConfig?.npmMatch) {
                      // Match-specific response
                      packageData = {
                        name: pkg.name,
                        ...execResult.result,
                        // Ensure we have basic info
                        version: execResult.result.version || pkg.version,
                        description:
                          execResult.result.description || pkg.description,
                        repository:
                          execResult.result.repository || pkg.repository,
                      };
                    } else {
                      // Full metadata response
                      packageData = execResult.result;
                    }

                    // Transform to optimized format if full metadata was requested
                    const optimizedMetadata =
                      queryConfig?.npmField || queryConfig?.npmMatch
                        ? packageData
                        : transformToOptimizedFormat(packageData);

                    // Extract git URL (repository URL)
                    const gitURL =
                      optimizedMetadata.repository || pkg.repository || '';

                    return {
                      packageName: pkg.name,
                      metadata: {
                        gitURL,
                        metadata: optimizedMetadata,
                      },
                    };
                  } catch (error) {
                    const errorMsg =
                      error instanceof Error ? error.message : String(error);
                    return {
                      packageName: pkg.name,
                      metadata: null,
                      error: `Failed to fetch metadata: ${errorMsg}`,
                    };
                  }
                }
              );

              // Execute npm metadata fetching concurrently with rate limiting (max 5 concurrent)
              const batchSize = 5;
              const npmMetadataResults: {
                packageName: string;
                metadata: EnhancedPackageMetadata | null;
                error?: string;
              }[] = [];

              for (let i = 0; i < npmMetadataPromises.length; i += batchSize) {
                const batch = npmMetadataPromises.slice(i, i + batchSize);
                const batchResults = await Promise.all(batch);
                npmMetadataResults.push(...batchResults);
              }

              // Process results and build enhanced response
              const enhancedNpmResults: Record<
                string,
                EnhancedPackageMetadata
              > = {};
              const metadataErrors: string[] = [];

              for (const result of npmMetadataResults) {
                if (result.metadata) {
                  enhancedNpmResults[result.packageName] = result.metadata;
                } else if (result.error) {
                  metadataErrors.push(`${result.packageName}: ${result.error}`);
                  // Fallback: use basic search data with repository as gitURL
                  const originalPkg = deduplicatedNpmPackages.find(
                    p => p.name === result.packageName
                  );
                  if (originalPkg) {
                    enhancedNpmResults[result.packageName] = {
                      gitURL: originalPkg.repository || '',
                      metadata: {
                        name: originalPkg.name,
                        version: originalPkg.version,
                        description: originalPkg.description || '',
                        license: 'Unknown',
                        repository: originalPkg.repository || '',
                        size: 'Unknown',
                        created: 'Unknown',
                        updated: 'Unknown',
                        versions: [],
                        stats: { total_versions: 0 },
                      } as OptimizedNpmPackageResult,
                    };
                  }
                }
              }

              // Add metadata errors to hints
              if (metadataErrors.length > 0) {
                hints.push('NPM metadata warnings:');
                metadataErrors.forEach(error => hints.push(` ${error}`));
                hints.push('');
              }

              // Process Python packages (simpler - no enhanced metadata yet)
              const enhancedPythonResults: Record<
                string,
                EnhancedPackageMetadata
              > = {};
              for (const pkg of deduplicatedPythonPackages) {
                const pythonMetadata: PythonPackageMetadata = {
                  name: pkg.name,
                  version: pkg.version,
                  description: pkg.description,
                  keywords: pkg.keywords,
                  repository: pkg.repository,
                };

                enhancedPythonResults[pkg.name] = {
                  gitURL: pkg.repository || '',
                  metadata: pythonMetadata,
                };
              }

              // Return enhanced response format
              const enhancedResult: EnhancedPackageSearchResult = {
                total_count: totalCount,
                hints: hints.length > 0 ? hints : undefined,
              };

              if (Object.keys(enhancedNpmResults).length > 0) {
                enhancedResult.npm = enhancedNpmResults;
              }

              if (Object.keys(enhancedPythonResults).length > 0) {
                enhancedResult.python = enhancedPythonResults;
              }

              return createResult({ data: enhancedResult });
            } catch (error) {
              // If metadata fetching fails completely, fall back to basic response
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              hints.push(`NPM metadata fetching failed: ${errorMsg}`);
              hints.push('Falling back to basic search results');
            }
          }

          // Return basic response format (when npmFetchMetadata is false or fallback)
          const basicResult: any = {
            total_count: totalCount,
            python: deduplicatedPythonPackages,
            hints: hints.length > 0 ? hints : undefined,
          };

          if (npmEnabled && deduplicatedNpmPackages.length > 0) {
            basicResult.npm = deduplicatedNpmPackages;
          }

          return createResult({
            data: basicResult,
          });
        }

        // Build detailed error message with ecosystem-specific information
        const errorDetails = [];

        if (errors.npm.length > 0) {
          errorDetails.push('NPM Search Issues:');
          errors.npm.forEach(error => errorDetails.push(`   ${error}`));
        }

        if (errors.python.length > 0) {
          errorDetails.push('Python Search Issues:');
          errors.python.forEach(error => errorDetails.push(`   ${error}`));
        }

        // If no specific errors were captured, use generic message
        if (errorDetails.length === 0) {
          const searchedTerms = [];
          if (normalizedPythonQueries.length > 0)
            searchedTerms.push(
              `Python: [${normalizedPythonQueries.map(q => q.name).join(', ')}]`
            );
          if (normalizedNpmQueries.length > 0)
            searchedTerms.push(
              `NPM: [${normalizedNpmQueries.map(q => q.name).join(', ')}]`
            );
          errorDetails.push(
            `No packages found for: ${searchedTerms.join(', ')}`
          );
        }

        // Smart fallback suggestions based on query patterns
        const hasSpecificTerms =
          normalizedNpmQueries.length > 0 &&
          normalizedNpmQueries.some(
            q =>
              q &&
              (q.name.includes('-') ||
                q.name.includes('@') ||
                q.name.length > 15)
          );

        const hasFrameworkTerms =
          normalizedNpmQueries.length > 0 &&
          normalizedNpmQueries.some(
            q =>
              q &&
              ['react', 'vue', 'angular', 'express', 'fastify'].some(fw =>
                q.name.toLowerCase().includes(fw)
              )
          );

        let fallbackSuggestions = [
          ' Try broader functional terms: "testing" instead of "jest-unit-test"',
          ' Remove version numbers or specific constraints',
          ' Use single keywords: "http" instead of "http-client-library"',
        ];

        if (hasSpecificTerms) {
          fallbackSuggestions = [
            ' Use simpler terms: "validation" instead of "schema-validation-library"',
            ' Try category terms: "database", "testing", "auth"',
            ...fallbackSuggestions.slice(1),
          ];
        }

        if (hasFrameworkTerms) {
          fallbackSuggestions.unshift(
            ' Try specific framework searches: "react hooks", "vue components"'
          );
        }

        // Add ecosystem-specific suggestions
        if (normalizedPythonQueries.length > 0 && errors.python.length > 0) {
          fallbackSuggestions.push(
            ' For Python: Try alternative names (e.g., "pillow" instead of "PIL")'
          );
          fallbackSuggestions.push(
            ' For Python: Check exact spelling on https://pypi.org'
          );
          fallbackSuggestions.push(
            'For Python: Use github_search_repos to find repository when PyPI lacks repository info'
          );
          fallbackSuggestions.push(
            'For Python: Search GitHub with package name as topic for alternative sources'
          );
        }

        if (
          npmEnabled &&
          normalizedNpmQueries.length > 0 &&
          errors.npm.length > 0
        ) {
          fallbackSuggestions.push(
            ' For NPM: Check package availability on https://npmjs.com'
          );
          fallbackSuggestions.push(
            ' For NPM: Try searching with exact package names'
          );
        }

        // Add GitHub integration suggestions
        fallbackSuggestions.push(
          ' Use github_search_repos with topic filters for project discovery'
        );

        if (npmEnabled && normalizedNpmQueries.length > 0) {
          fallbackSuggestions.push(
            ' Check npm registry status: https://status.npmjs.org'
          );
        }

        // Add package type suggestion
        if (npmEnabled) {
          const packageTypeSuggestion =
            normalizedPythonQueries.length > 0
              ? 'Try searching with npmPackageName if this is an NPM package'
              : 'Try searching with pythonPackageName if this is a Python package';
          fallbackSuggestions.push(packageTypeSuggestion);
        }

        const customHints = [...errorDetails, ...fallbackSuggestions];

        const hints = generateSmartHints(TOOL_NAMES.PACKAGE_SEARCH, {
          hasResults: false,
          errorMessage: 'No packages found',
          customHints,
        });

        return createResult({
          isError: true,
          hints,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Network/connectivity issues
        if (
          errorMsg.includes('network') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('ENOTFOUND')
        ) {
          const { fallback } = getToolSuggestions(TOOL_NAMES.PACKAGE_SEARCH, {
            hasError: true,
          });

          return createResult({
            isError: true,
            hints: [
              ERROR_MESSAGES.NPM_CONNECTION_FAILED,
              ' Check internet connection and npm registry status',
              ' Try fewer search terms to reduce load',
              ' Retry in a few moments',
              createToolSuggestion(TOOL_NAMES.PACKAGE_SEARCH, fallback),
            ],
          });
        }

        // NPM CLI issues
        if (
          errorMsg.includes('command not found') ||
          errorMsg.includes('npm')
        ) {
          const { fallback } = getToolSuggestions(TOOL_NAMES.PACKAGE_SEARCH, {
            hasError: true,
          });

          return createResult({
            isError: true,
            hints: [
              ERROR_MESSAGES.NPM_CLI_ERROR,
              ' Verify NPM installation: npm --version',
              ' Update NPM: npm install -g npm@latest',
              ' Check PATH environment variable',
              createToolSuggestion(TOOL_NAMES.PACKAGE_SEARCH, fallback),
            ],
          });
        }

        // Permission/auth issues
        if (
          errorMsg.includes('permission') ||
          errorMsg.includes('403') ||
          errorMsg.includes('401')
        ) {
          const { fallback } = getToolSuggestions(TOOL_NAMES.PACKAGE_SEARCH, {
            errorType: 'access_denied',
          });

          return createResult({
            isError: true,
            hints: [
              ERROR_MESSAGES.NPM_PERMISSION_ERROR,
              ' Check npm login status: npm whoami',
              ' Use public registry search without auth',
              ' Verify npm registry configuration',
              createToolSuggestion(TOOL_NAMES.PACKAGE_SEARCH, fallback),
            ],
          });
        }

        const { fallback } = getToolSuggestions(TOOL_NAMES.PACKAGE_SEARCH, {
          hasError: true,
        });

        return createResult({
          isError: true,
          hints: [
            ERROR_MESSAGES.PACKAGE_SEARCH_FAILED,
            `Error: ${errorMsg}`,
            'Troubleshooting steps:',
            ' 1. Check npm status and try again',
            ' 2. Try broader or alternative search terms',
            createToolSuggestion(TOOL_NAMES.PACKAGE_SEARCH, fallback),
          ],
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

/**
 * Fetch NPM package metadata using npm view command
 * Merged from npm_view_package.ts functionality
 */
async function viewNpmPackage(
  packageName: string,
  field?: string,
  match?: string | string[]
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-view', { packageName, field, match });

  return withCache(cacheKey, async () => {
    try {
      const builder = new NpmPackageViewBuilder();
      // Build arguments based on parameters
      // Priority: field > match > full JSON
      let args: string[];
      if (field) {
        args = builder.build({ packageName, field });
      } else if (match) {
        // Handle match parameter - it might be a JSON string that needs parsing
        let parsedMatch = match;
        if (
          typeof match === 'string' &&
          match.startsWith('[') &&
          match.endsWith(']')
        ) {
          try {
            parsedMatch = JSON.parse(match);
          } catch (e) {
            // If parsing fails, treat as a single field name
            parsedMatch = match;
          }
        }

        const matchFields = Array.isArray(parsedMatch)
          ? parsedMatch
          : [parsedMatch];
        args = builder.build({ packageName, match: matchFields });
      } else {
        args = builder.build({ packageName });
      }

      // Determine the command type based on whether builder includes base command
      const hasBaseCommand = args[0] === 'view';
      const command = hasBaseCommand ? args[0] : 'view';
      const commandArgs = hasBaseCommand ? args.slice(1) : args;

      const result = await executeNpmCommand(command as 'view', commandArgs, {
        cache: false,
      });
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '';

      if (errorMessage.includes('404')) {
        return createResult({
          error:
            'Package not found on NPM registry. Verify the exact package name',
        });
      }

      return createResult({
        error: 'Failed to execute NPM command. Check npm installation',
      });
    }
  });
}

/**
 * Transform NPM CLI response to optimized format for code analysis
 * Merged from npm_view_package.ts functionality
 */
function transformToOptimizedFormat(
  packageData: any
): OptimizedNpmPackageResult {
  // Extract repository URL and simplify
  const repoUrl =
    packageData.repository?.url || packageData.repositoryGitUrl || '';
  const repository = repoUrl ? simplifyRepoUrl(repoUrl) : '';

  // Simplify exports to essential entry points only
  const exports = packageData.exports
    ? simplifyExports(packageData.exports)
    : undefined;

  // Get version timestamps from time object and limit to last 5
  const timeData = packageData.time || {};
  const versionList = Array.isArray(packageData.versions)
    ? packageData.versions
    : [];
  const recentVersions = versionList.slice(-5).map((version: string) => ({
    version,
    date: timeData[version] ? toDDMMYYYY(timeData[version]) : 'Unknown',
  }));

  const result: OptimizedNpmPackageResult = {
    name: packageData.name,
    version: packageData.version,
    description: packageData.description || '',
    license: packageData.license || 'Unknown',
    repository,
    size: humanizeBytes(packageData.dist?.unpackedSize || 0),
    created: timeData.created ? toDDMMYYYY(timeData.created) : 'Unknown',
    updated: timeData.modified ? toDDMMYYYY(timeData.modified) : 'Unknown',
    versions: recentVersions,
    stats: {
      total_versions: versionList.length,
      weekly_downloads: packageData.weeklyDownloads,
    },
  };

  // Add exports only if they exist and are useful
  if (exports && Object.keys(exports).length > 0) {
    result.exports = exports;
  }

  return result;
}

/**
 * Simplify exports to show only essential entry points for code navigation
 * Merged from npm_view_package.ts functionality
 */
function simplifyExports(exports: any): {
  main: string;
  types?: string;
  [key: string]: any;
} {
  if (typeof exports === 'string') {
    return { main: exports };
  }

  if (typeof exports === 'object') {
    const simplified: any = {};

    // Extract main entry point
    if (exports['.']) {
      const mainExport = exports['.'];
      if (typeof mainExport === 'string') {
        simplified.main = mainExport;
      } else if (mainExport.default) {
        simplified.main = mainExport.default;
      } else if (mainExport.import) {
        simplified.main = mainExport.import;
      }
    }

    // Extract types if available with safe property access
    if (
      exports['./types'] ||
      (exports['.'] && typeof exports['.'] === 'object' && exports['.'].types)
    ) {
      simplified.types = exports['./types'] || (exports['.'] as any).types;
    }

    // Add a few other important exports (max 3 total)
    let count = 0;
    for (const [key, value] of Object.entries(exports)) {
      if (count >= 3 || key === '.' || key === './types') continue;
      if (key.includes('package.json') || key.includes('node_modules'))
        continue;

      simplified[key] =
        typeof value === 'object' ? (value as any).default || value : value;
      count++;
    }

    return simplified;
  }

  return { main: 'index.js' };
}
