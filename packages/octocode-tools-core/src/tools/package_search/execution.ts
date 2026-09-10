import type { CallToolResult } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { ArtifactSearchQueryLocalSchema } from '@octocodeai/octocode-core/schema';
import {
  searchRegistry,
  ArtifactProviderError,
} from '../../utils/artifact/index.js';
import { executeBulkOperation } from '../../utils/response/bulk/response.js';
import {
  createSuccessResult,
  createErrorResult,
  safeParseOrError,
} from '../utils.js';
import { TOOL_NAMES } from '../toolMetadata/names.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { ArtifactCursorError, paginateArtifacts } from './pagination.js';
import { searchNpmArtifacts } from './npm.js';

type ArtifactSearchQuery = z.input<typeof ArtifactSearchQueryLocalSchema>;

export async function searchPackages(
  args: ToolExecutionArgs<ArtifactSearchQuery>
): Promise<CallToolResult> {
  return executeBulkOperation(
    args.queries,
    async query => {
      const parsed = safeParseOrError(ArtifactSearchQueryLocalSchema, query);
      if (parsed.ok === false) return parsed.error;
      try {
        const result = await paginateArtifacts(parsed.data!, (input, state) =>
          input.type === 'npm'
            ? searchNpmArtifacts(input, state)
            : searchRegistry(input, state)
        );
        const hasContent = result.artifacts.length > 0;
        return createSuccessResult(
          query,
          {
            type: query.type,
            ...result,
            ...(!hasContent && !result.pagination.hasMore
              ? {
                  hints: [
                    query.packageName
                      ? 'Check the package name and ecosystem coordinate.'
                      : 'Try fewer or broader keywords.',
                  ],
                }
              : {}),
          },
          hasContent,
          TOOL_NAMES.PACKAGE_SEARCH
        );
      } catch (error) {
        const typed =
          error instanceof ArtifactProviderError ||
          error instanceof ArtifactCursorError;
        return {
          ...createErrorResult(error, query, {
            toolName: TOOL_NAMES.PACKAGE_SEARCH,
          }),
          ...(typed ? { errorCode: error.code } : {}),
          ...(error instanceof ArtifactCursorError
            ? { hints: ['Restart the same query without cursor.'] }
            : {}),
          ...(error instanceof ArtifactProviderError &&
          error.code === 'unsupported_capability'
            ? {
                hints: [
                  'Use type:pypi with packageName for exact Python package lookup.',
                ],
              }
            : {}),
        };
      }
    },
    {
      toolName: TOOL_NAMES.PACKAGE_SEARCH,
      keysPriority: ['artifacts', 'pagination', 'error'],
    },
    args
  );
}
