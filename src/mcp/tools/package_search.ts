import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../responses';
import { searchPackagesAPI } from '../../utils/package';
import {
  PackageSearchWithMetadataParams,
  PackageSearchBulkParams,
} from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ERROR_MESSAGES } from '../errorMessages';
import {
  generateSmartHints,
  getToolSuggestions,
  getResearchGoalHints,
} from './utils/toolRelationships';
import { createToolSuggestion } from './utils/validation';
import {
  TOOL_NAMES,
  ToolOptions,
  ResearchGoalEnum,
} from './utils/toolConstants';

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

        // Validate input parameters
        const isUsingBulkFormat = !!(args.npmPackages || args.pythonPackages);
        const isUsingLegacyFormat = !!(
          args.npmPackagesNames ||
          args.npmPackageName ||
          args.pythonPackageName
        );

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

        // Call the API function
        const result = await searchPackagesAPI(args, npmEnabled);

        // Check if result is an error
        if ('error' in result) {
          const hints = generateSmartHints(TOOL_NAMES.PACKAGE_SEARCH, {
            hasResults: false,
            errorMessage: result.error,
            customHints: result.hints || [],
          });
          return createResult({
            error: result.error,
            hints,
          });
        }

        // Success - generate hints and add research goal hints if needed
        const totalCount = result.total_count;
        const customHints = [];

        // Add error hints if there were any partial failures
        if ('errors' in result && result.errors) {
          const errors = result.errors as { npm: string[]; python: string[] };
          if (errors.npm.length > 0 || errors.python.length > 0) {
            customHints.push('Search had some errors:');
            errors.npm.forEach((error: string) =>
              customHints.push(`NPM: ${error}`)
            );
            errors.python.forEach((error: string) =>
              customHints.push(`Python: ${error}`)
            );
          }
        }

        const hints = generateSmartHints(TOOL_NAMES.PACKAGE_SEARCH, {
          hasResults: totalCount > 0,
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

        // Add hints to result if not already present
        const resultWithHints = {
          ...result,
          hints: result.hints || hints,
        };

        return createResult({
          data: resultWithHints,
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
