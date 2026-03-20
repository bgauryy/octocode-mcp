import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { GitHubCodeSearchQuery, SearchResult } from './types.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { handleCatchError, createSuccessResult } from '../utils.js';
import {
  buildPaginationHints,
  mapCodeSearchProviderResult,
  mapCodeSearchToolQuery,
} from '../providerMappers.js';
import {
  createProviderExecutionContext,
  executeProviderOperation,
} from '../providerExecution.js';

export async function searchMultipleGitHubCode(
  args: ToolExecutionArgs<GitHubCodeSearchQuery>
): Promise<CallToolResult> {
  const { queries, authInfo, responseCharOffset, responseCharLength } = args;
  let providerContext:
    | ReturnType<typeof createProviderExecutionContext>
    | undefined;
  const getProviderContext = () =>
    (providerContext ??= createProviderExecutionContext(authInfo));

  return executeBulkOperation(
    queries,
    async (query: GitHubCodeSearchQuery, _index: number) => {
      try {
        const currentProviderContext = getProviderContext();

        const providerResult = await executeProviderOperation(query, () =>
          currentProviderContext.provider.searchCode(
            mapCodeSearchToolQuery(query)
          )
        );

        if (!providerResult.ok) {
          return providerResult.result;
        }

        const result: SearchResult = mapCodeSearchProviderResult(
          providerResult.response.data,
          query
        );

        const hasContent = (result.files?.length || 0) > 0;
        const hasOwnerRepo = !!(query.owner && query.repo);
        const paginationHints = result.pagination
          ? buildPaginationHints(result.pagination, 'matches')
          : [];

        return createSuccessResult(
          query,
          result as unknown as Record<string, unknown>,
          hasContent,
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          {
            hintContext: { hasOwnerRepo, match: query.match },
            extraHints: paginationHints,
          }
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      keysPriority: ['files', 'pagination', 'repositoryContext', 'error'],
      responseCharOffset,
      responseCharLength,
    }
  );
}
