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
import { searchPackage } from '../utils/package.js';
import type {
  PackageSearchAPIResult,
  PackageSearchError,
  PackageResult,
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
        const customHints = hasContent
          ? generateSuccessHints(result)
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

function generateSuccessHints(result: {
  packages: PackageResult[];
  ecosystem: 'npm' | 'python';
}): string[] {
  const hints: string[] = [];

  // Check for repository links
  const hasRepoLinks = result.packages.some(pkg => pkg.repository);
  if (hasRepoLinks) {
    hints.push(
      'Use repository URLs with GitHub tools for deeper code analysis'
    );
  }

  // Ecosystem-specific hints
  if (result.ecosystem === 'npm') {
    hints.push('Check package.json for dependency compatibility');
  } else {
    hints.push('Check requirements.txt or pyproject.toml for compatibility');
  }

  return hints;
}

function generateEmptyHints(query: PackageSearchQuery): string[] {
  const hints: string[] = [];

  hints.push(`No ${query.ecosystem} packages found matching '${query.name}'`);
  hints.push('Try alternative package names or broader search terms');

  if (query.ecosystem === 'npm') {
    hints.push('Visit https://npmjs.com to browse packages');
  } else {
    hints.push('Visit https://pypi.org to browse packages');
  }

  return hints;
}
