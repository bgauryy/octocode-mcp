import {
  McpServer,
  RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import type { ToolInvocationCallback } from '../types.js';
import { TOOL_NAMES, DESCRIPTIONS } from './toolMetadata.js';
import { PackageSearchBulkQuerySchema } from '../scheme/package_search.js';
import type { PackageSearchQuery } from '../scheme/package_search.js';
import { searchPackage, checkNpmDeprecation } from '../utils/package.js';
import type {
  PackageSearchAPIResult,
  PackageSearchError,
  PackageResult,
  DeprecationInfo,
} from '../utils/package.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';
import {
  handleCatchError,
  createSuccessResult,
  createErrorResult,
} from './utils.js';
import { checkNpmAvailability } from '../utils/exec.js';

export async function registerPackageSearchTool(
  server: McpServer,
  callback?: ToolInvocationCallback
): Promise<RegisteredTool | null> {
  // Check if npm registry is reachable (10 second timeout)
  const npmAvailable = await checkNpmAvailability(10000);
  if (!npmAvailable) {
    return null;
  }

  return server.registerTool(
    TOOL_NAMES.PACKAGE_SEARCH,
    {
      description: DESCRIPTIONS[TOOL_NAMES.PACKAGE_SEARCH],
      inputSchema: PackageSearchBulkQuerySchema,
      annotations: {
        title: 'Package Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    withSecurityValidation(
      TOOL_NAMES.PACKAGE_SEARCH,
      async (
        args: {
          queries: PackageSearchQuery[];
        },
        _authInfo,
        _sessionId
      ): Promise<CallToolResult> => {
        const queries = args.queries || [];

        if (callback) {
          try {
            await callback(TOOL_NAMES.PACKAGE_SEARCH, queries);
          } catch {
            // ignore
          }
        }

        return searchPackages(queries);
      }
    )
  );
}

function isPackageSearchError(
  result: PackageSearchAPIResult | PackageSearchError
): result is PackageSearchError {
  return 'error' in result;
}

async function searchPackages(
  queries: PackageSearchQuery[]
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: PackageSearchQuery, _index: number) => {
      try {
        const apiResult = await searchPackage(query);

        if (isPackageSearchError(apiResult)) {
          return createErrorResult(query, apiResult.error);
        }

        const result = {
          packages: apiResult.packages as PackageResult[],
          ecosystem: apiResult.ecosystem,
          totalFound: apiResult.totalFound,
        };

        const hasContent = result.packages.length > 0;

        // Check deprecation for npm packages (only for first package to avoid too many API calls)
        let deprecationInfo: DeprecationInfo | null = null;
        if (hasContent && result.ecosystem === 'npm' && result.packages[0]) {
          deprecationInfo = await checkNpmDeprecation(result.packages[0].name);
        }

        const customHints = hasContent
          ? generateSuccessHints(result, deprecationInfo)
          : generateEmptyHints(query);

        return createSuccessResult(
          query,
          result,
          hasContent,
          'PACKAGE_SEARCH',
          customHints
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.PACKAGE_SEARCH,
      keysPriority: ['packages', 'ecosystem', 'totalFound', 'error'],
    }
  );
}

function generateSuccessHints(
  result: {
    packages: PackageResult[];
    ecosystem: 'npm' | 'python';
  },
  deprecationInfo?: DeprecationInfo | null
): string[] {
  const hints: string[] = [];
  const pkg = result.packages[0];

  // Deprecation warning (highest priority)
  if (deprecationInfo?.deprecated) {
    const msg = deprecationInfo.message || 'This package is deprecated';
    hints.push(`DEPRECATED: ${pkg?.name} - ${msg}`);
  }

  // GitHub tool integration hint - extract owner/repo from URL
  if (pkg?.repository?.includes('github.com')) {
    const match = pkg.repository.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match && match[1] && match[2]) {
      const owner = match[1];
      const repo = match[2];
      const cleanRepo = repo.replace(/\.git$/, '').replace(/\/$/, '');
      hints.push(
        `Explore: githubViewRepoStructure(owner="${owner}", repo="${cleanRepo}")`
      );
    }
  }

  // Install command hint
  hints.push(
    result.ecosystem === 'npm'
      ? `Install: npm install ${pkg?.name || 'package'}`
      : `Install: pip install ${pkg?.name || 'package'}`
  );

  return hints;
}

function generateEmptyHints(query: PackageSearchQuery): string[] {
  const hints: string[] = [];
  const name = query.name;

  hints.push(`No ${query.ecosystem} packages found for '${name}'`);

  // Generate name variations
  const variations = generateNameVariations(name, query.ecosystem);
  if (variations.length > 0) {
    hints.push(`Try: ${variations.join(', ')}`);
  }

  // Browse link
  const browseUrl =
    query.ecosystem === 'npm'
      ? `https://npmjs.com/search?q=${encodeURIComponent(name)}`
      : `https://pypi.org/search/?q=${encodeURIComponent(name)}`;
  hints.push(`Browse: ${browseUrl}`);

  return hints;
}

function generateNameVariations(
  name: string,
  ecosystem: 'npm' | 'python'
): string[] {
  const variations: string[] = [];

  // Convert hyphens to underscores and vice versa
  if (name.includes('-')) {
    variations.push(name.replace(/-/g, '_'));
    variations.push(name.replace(/-/g, ''));
  }
  if (name.includes('_')) {
    variations.push(name.replace(/_/g, '-'));
  }

  // Extract unscoped name from @scope/name packages
  if (name.startsWith('@')) {
    const unscoped = name.split('/').pop();
    if (unscoped) variations.push(unscoped);
  }

  // Ecosystem-specific variations
  if (ecosystem === 'npm' && !name.endsWith('js')) {
    variations.push(name + 'js');
  }
  if (ecosystem === 'python' && !name.startsWith('py')) {
    variations.push('py' + name);
  }

  // Return unique variations, excluding original name, limited to 3
  return [...new Set(variations)].filter(v => v !== name).slice(0, 3);
}
