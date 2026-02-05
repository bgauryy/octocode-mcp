import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { FileContentQuery } from './types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { handleCatchError, createSuccessResult } from '../utils.js';
import { getProvider } from '../../providers/factory.js';
import { getActiveProviderConfig } from '../../serverConfig.js';
import { isProviderSuccess } from '../../providers/types.js';

export async function fetchMultipleGitHubFileContents(
  args: ToolExecutionArgs<FileContentQuery>
): Promise<CallToolResult> {
  const { queries, authInfo } = args;
  const { provider: providerType, baseUrl, token } = getActiveProviderConfig();

  return executeBulkOperation(
    queries,
    async (query: FileContentQuery, _index: number) => {
      try {
        // Get provider instance
        const provider = getProvider(providerType, {
          type: providerType,
          baseUrl,
          token,
          authInfo,
        });

        const fullContent = Boolean(query.fullContent);

        // Convert query to provider format
        const providerQuery = {
          projectId: `${query.owner}/${query.repo}`,
          path: String(query.path),
          ref: query.branch ? String(query.branch) : undefined,
          startLine: fullContent ? undefined : query.startLine,
          endLine: fullContent ? undefined : query.endLine,
          matchString:
            fullContent || !query.matchString
              ? undefined
              : String(query.matchString),
          matchStringContextLines: query.matchStringContextLines ?? 5,
          charOffset: query.charOffset ?? 0,
          charLength: query.charLength,
          fullContent,
          mainResearchGoal: query.mainResearchGoal,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };

        const apiResult = await provider.getFileContent(providerQuery);

        if (!isProviderSuccess(apiResult)) {
          return handleCatchError(
            new Error(apiResult.error || 'Provider error'),
            query
          );
        }

        // Transform provider response to tool result format
        const resultData: Record<string, unknown> = {
          owner: query.owner,
          repo: query.repo,
          path: apiResult.data.path,
          branch: apiResult.data.ref,
          contentLength: apiResult.data.size,
          content: apiResult.data.content,
          ...(apiResult.data.isPartial && {
            isPartial: apiResult.data.isPartial,
          }),
          ...(apiResult.data.startLine && {
            startLine: apiResult.data.startLine,
          }),
          ...(apiResult.data.endLine && { endLine: apiResult.data.endLine }),
          ...(apiResult.data.lastModified && {
            lastModified: apiResult.data.lastModified,
          }),
          ...(apiResult.data.lastModifiedBy && {
            lastModifiedBy: apiResult.data.lastModifiedBy,
          }),
          ...(apiResult.data.pagination && {
            pagination: apiResult.data.pagination,
          }),
        };

        const hasContent = Boolean(
          apiResult.data.content && apiResult.data.content.length > 0
        );

        const paginationHints = apiResult.hints || [];
        const isLarge = apiResult.data.size > 50000;

        return createSuccessResult(
          query,
          resultData,
          hasContent,
          TOOL_NAMES.GITHUB_FETCH_CONTENT,
          {
            hintContext: { isLarge },
            extraHints: paginationHints,
          }
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      keysPriority: [
        'owner',
        'repo',
        'path',
        'branch',
        'contentLength',
        'content',
        'pagination',
        'isPartial',
        'startLine',
        'endLine',
        'lastModified',
        'lastModifiedBy',
        'matchLocations',
        'error',
      ],
    }
  );
}
