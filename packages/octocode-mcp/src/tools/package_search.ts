import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation';
import { createResult } from '../responses';
import { TOOL_NAMES } from '../constants';
import { generateHints } from './hints';
import {
  BulkPackageSearchSchema,
  BulkPackageSearchParams,
} from '../scheme/package_search';
import { searchPackagesAPI } from '../npm/package';
import { PackageSearchBulkParams } from './types';
import { DESCRIPTIONS } from './descriptions';

export function registerPackageSearchTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.PACKAGE_SEARCH,
    {
      description: DESCRIPTIONS[TOOL_NAMES.PACKAGE_SEARCH],
      inputSchema: BulkPackageSearchSchema.shape,
      annotations: {
        title: 'Package Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      async (args: BulkPackageSearchParams): Promise<CallToolResult> => {
        // Validate that at least one type of query is provided
        const hasNpmQueries =
          Array.isArray(args.npmPackages) && args.npmPackages.length > 0;
        const hasPythonQueries =
          Array.isArray(args.pythonPackages) && args.pythonPackages.length > 0;

        if (!hasNpmQueries && !hasPythonQueries) {
          const hints = generateHints({
            toolName: TOOL_NAMES.PACKAGE_SEARCH,
            hasResults: false,
            totalItems: 0,
            errorMessage: 'No package queries provided',
            customHints: [
              'Use npmPackages or pythonPackages arrays with package names',
              'Search by functionality: "http client", "database ORM", "testing framework"',
            ],
          });

          return createResult({
            isError: true,
            error: 'At least one package search query is required',
            hints,
          });
        }

        const totalQueries =
          (Array.isArray(args.npmPackages) ? args.npmPackages.length : 0) +
          (Array.isArray(args.pythonPackages) ? args.pythonPackages.length : 0);

        if (totalQueries > 10) {
          const hints = generateHints({
            toolName: TOOL_NAMES.PACKAGE_SEARCH,
            hasResults: false,
            errorMessage: 'Too many queries provided',
            customHints: [
              'Limit to 10 package queries per request for optimal performance',
            ],
          });

          return createResult({
            isError: true,
            error: 'Maximum 10 package queries allowed per request',
            hints,
          });
        }

        try {
          // Add IDs to queries if not provided
          const enhancedArgs = { ...args };
          if (enhancedArgs.npmPackages) {
            enhancedArgs.npmPackages = enhancedArgs.npmPackages.map(
              (pkg, index) => ({
                ...pkg,
                id: pkg.id || `npm-${index + 1}`,
              })
            );
          }
          if (enhancedArgs.pythonPackages) {
            enhancedArgs.pythonPackages = enhancedArgs.pythonPackages.map(
              (pkg, index) => ({
                ...pkg,
                id: pkg.id || `python-${index + 1}`,
              })
            );
          }

          // Use the unified searchPackagesAPI function
          // NPM enablement is now handled internally by searchPackagesAPI
          const searchResult = await searchPackagesAPI(
            enhancedArgs as PackageSearchBulkParams
          );

          // Handle the result based on its type
          if ('error' in searchResult) {
            const hints = generateHints({
              toolName: TOOL_NAMES.PACKAGE_SEARCH,
              hasResults: false,
              totalItems: 0,
              errorMessage: searchResult.error,
              customHints: searchResult.hints || [],
            });

            return createResult({
              error: searchResult.error,
              hints,
            });
          }

          // Success - generate intelligent hints
          const npmResults: Array<Record<string, unknown>> =
            'npmResults' in searchResult
              ? Array.isArray(searchResult.npmResults)
                ? searchResult.npmResults
                : []
              : Array.isArray(
                    (searchResult as unknown as Record<string, unknown>).npm
                  )
                ? ((searchResult as unknown as Record<string, unknown>)
                    .npm as Array<Record<string, unknown>>)
                : [];
          const pythonResults: Array<Record<string, unknown>> =
            'pythonResults' in searchResult
              ? Array.isArray(searchResult.pythonResults)
                ? searchResult.pythonResults
                : []
              : Array.isArray(
                    (searchResult as unknown as Record<string, unknown>).python
                  )
                ? ((searchResult as unknown as Record<string, unknown>)
                    .python as Array<Record<string, unknown>>)
                : [];
          const totalPackages =
            (npmResults?.length || 0) + (pythonResults?.length || 0);

          const responseContext = {
            foundEcosystems: [
              ...(npmResults && npmResults.length > 0 ? ['npm'] : []),
              ...(pythonResults && pythonResults.length > 0 ? ['python'] : []),
            ],
            repositoryLinks: [
              ...(npmResults?.flatMap((pkg: Record<string, unknown>) =>
                (pkg.repository as Record<string, unknown>)?.url
                  ? [(pkg.repository as Record<string, unknown>).url as string]
                  : []
              ) || []),
              ...(pythonResults?.flatMap((pkg: Record<string, unknown>) =>
                (pkg.project_urls as Record<string, unknown>)?.Homepage
                  ? [
                      (pkg.project_urls as Record<string, unknown>)
                        .Homepage as string,
                    ]
                  : []
              ) || []),
            ].slice(0, 5), // Limit to 5 most relevant repositories
            dataQuality: {
              hasContent: totalPackages > 0,
              hasRepositoryLinks:
                npmResults?.some(
                  (pkg: Record<string, unknown>) =>
                    (pkg.repository as Record<string, unknown>)?.url
                ) ||
                pythonResults?.some(
                  (pkg: Record<string, unknown>) =>
                    (pkg.project_urls as Record<string, unknown>)?.Homepage
                ) ||
                false,
              hasMetadata:
                npmResults?.some(
                  (pkg: Record<string, unknown>) =>
                    pkg.version || pkg.description
                ) ||
                pythonResults?.some(
                  (pkg: Record<string, unknown>) => pkg.version || pkg.summary
                ) ||
                false,
            },
          };

          const hints = generateHints({
            toolName: TOOL_NAMES.PACKAGE_SEARCH,
            hasResults: totalPackages > 0,
            totalItems: totalPackages,
            customHints:
              responseContext.repositoryLinks.length > 0
                ? [
                    'Use repository URLs with GitHub tools for deeper code analysis',
                    'Compare package metadata to evaluate alternatives and trade-offs',
                  ]
                : [],
          });

          return createResult({
            data: {
              ...searchResult,
              apiSource: true,
            },
            meta: {
              totalPackages,
              ecosystems: responseContext.foundEcosystems,
              repositoryCount: responseContext.repositoryLinks.length,
              hasMetadata: responseContext.dataQuality.hasMetadata,
            },
            hints,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const hints = generateHints({
            toolName: TOOL_NAMES.PACKAGE_SEARCH,
            hasResults: false,
            totalItems: 0,
            errorMessage,
            customHints: [
              'Check package names for typos or alternative spellings',
              'Try broader search terms if specific packages are not found',
              'Verify ecosystem selection (NPM vs Python)',
            ],
          });

          return createResult({
            isError: true,
            error: `Failed to search packages: ${errorMessage}`,
            hints,
          });
        }
      }
    )
  );
}
