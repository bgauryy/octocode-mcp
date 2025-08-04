import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from './utils/withSecurityValidation';
import { createResult } from '../responses';
import { ToolOptions, TOOL_NAMES } from './utils/toolConstants';
import { generateToolHints } from './utils/hints';
import {
  BulkPackageSearchSchema,
  BulkPackageSearchParams,
} from './scheme/package_search';
import { searchPackagesAPI } from '../../utils/package';

const DESCRIPTION = `Discover NPM and Python packages with metadata and repository links.

Trigger when other tools have a context of a package or a project that needs to be analyzed
Or when need to get information about npm or python package or a project
In many cases better to use package search first to get github repository url`;

export function registerPackageSearchTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.PACKAGE_SEARCH,
    {
      description: DESCRIPTION,
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
        const hasNpmQueries = args.npmPackages && args.npmPackages.length > 0;
        const hasPythonQueries =
          args.pythonPackages && args.pythonPackages.length > 0;

        if (!hasNpmQueries && !hasPythonQueries) {
          const hints = generateToolHints(TOOL_NAMES.PACKAGE_SEARCH, {
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
          (args.npmPackages?.length || 0) + (args.pythonPackages?.length || 0);

        if (totalQueries > 10) {
          const hints = generateToolHints(TOOL_NAMES.PACKAGE_SEARCH, {
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
          // Use the unified searchPackagesAPI function
          const searchResult = await searchPackagesAPI(args, opts.npmEnabled);

          // Handle the result based on its type
          if ('error' in searchResult) {
            const hints = generateToolHints(TOOL_NAMES.PACKAGE_SEARCH, {
              hasResults: false,
              totalItems: 0,
              errorMessage: searchResult.error,
              customHints: searchResult.hints || [],
              researchGoal: args.researchGoal,
            });

            return createResult({
              error: searchResult.error,
              hints,
            });
          }

          // Success - generate intelligent hints
          const npmResults: any[] =
            'npmResults' in searchResult
              ? searchResult.npmResults || []
              : (searchResult as any).npm || [];
          const pythonResults: any[] =
            'pythonResults' in searchResult
              ? searchResult.pythonResults || []
              : (searchResult as any).python || [];
          const totalPackages =
            (npmResults?.length || 0) + (pythonResults?.length || 0);

          const responseContext = {
            foundEcosystems: [
              ...(npmResults && npmResults.length > 0 ? ['npm'] : []),
              ...(pythonResults && pythonResults.length > 0 ? ['python'] : []),
            ],
            repositoryLinks: [
              ...(npmResults?.flatMap((pkg: any) =>
                pkg.repository?.url ? [pkg.repository.url] : []
              ) || []),
              ...(pythonResults?.flatMap((pkg: any) =>
                pkg.project_urls?.Homepage ? [pkg.project_urls.Homepage] : []
              ) || []),
            ].slice(0, 5), // Limit to 5 most relevant repositories
            dataQuality: {
              hasContent: totalPackages > 0,
              hasRepositoryLinks:
                npmResults?.some((pkg: any) => pkg.repository?.url) ||
                pythonResults?.some((pkg: any) => pkg.project_urls?.Homepage) ||
                false,
              hasMetadata:
                npmResults?.some(
                  (pkg: any) => pkg.version || pkg.description
                ) ||
                pythonResults?.some((pkg: any) => pkg.version || pkg.summary) ||
                false,
            },
          };

          const hints = generateToolHints(TOOL_NAMES.PACKAGE_SEARCH, {
            hasResults: totalPackages > 0,
            totalItems: totalPackages,
            researchGoal: args.researchGoal,
            responseContext,
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
              researchGoal: args.researchGoal,
            },
            hints,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const hints = generateToolHints(TOOL_NAMES.PACKAGE_SEARCH, {
            hasResults: false,
            totalItems: 0,
            errorMessage,
            researchGoal: args.researchGoal,
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
