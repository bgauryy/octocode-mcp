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

const DESCRIPTION = `
Efficiently discover and analyze packages across NPM and Python ecosystems with metadata and repository links.

This tool provides comprehensive package discovery with intelligent filtering, error recovery,
and context-aware suggestions. Perfect for finding libraries, analyzing dependencies, and
exploring alternatives with direct links to source repositories.

Key Features:
- Multi-ecosystem search: NPM and Python package discovery
- Repository integration: Direct links to GitHub repositories for deeper analysis
- Metadata analysis: Versions, dependencies, popularity metrics
- Research optimization: Tailored hints based on your research goals

Best Practices:
- Search by functionality rather than exact package names for broader discovery
- Use repository URLs from results with GitHub tools for code analysis
- Compare multiple packages to understand trade-offs and alternatives
- Specify research goals for optimized next-step suggestions
`;

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
        const hasQueries = args.queries && args.queries.length > 0;
        const hasNpmQueries = args.npmPackages && args.npmPackages.length > 0;
        const hasPythonQueries =
          args.pythonPackages && args.pythonPackages.length > 0;
        const hasLegacyNpm = args.npmPackageName || args.npmPackagesNames;

        if (
          !hasQueries &&
          !hasNpmQueries &&
          !hasPythonQueries &&
          !hasLegacyNpm
        ) {
          const hints = generateToolHints(TOOL_NAMES.PACKAGE_SEARCH, {
            hasResults: false,
            totalItems: 0,
            errorMessage: 'No package queries provided',
            customHints: [
              'Provide queries array with package search configurations',
              'Legacy: Use npmPackages or pythonPackages arrays with package names',
              'Search by functionality: "http client", "database ORM", "testing framework"',
            ],
          });

          return createResult({
            isError: true,
            error: 'At least one package search query is required',
            hints,
          });
        }

        if (args.queries && args.queries.length > 10) {
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
            },
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
