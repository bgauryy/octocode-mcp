import type { CallToolResult } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { TOOL_NAMES } from '../toolMetadata/names.js';
import { executeBulkOperation } from '../../utils/response/bulk/response.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import {
  handleCatchError,
  createSuccessResult,
  safeParseOrError,
} from '../utils.js';
import { FileContentQueryLocalSchema } from '@octocodeai/octocode-core/schema';
import type { MinifyMode } from '@octocodeai/octocode-core/schema';
import {
  mapFileContentProviderResult,
  mapFileContentToolQuery,
} from '../providerMappers/fileContent.js';
import {
  createLazyProviderContext,
  type createProviderExecutionContext,
  executeProviderOperation,
} from '../providerExecution.js';
import { buildGithubFetchContentFinalizer } from './finalizer.js';

type FileContentInputQuery = z.input<typeof FileContentQueryLocalSchema>;

type PartialFileContentQuery = z.output<typeof FileContentQueryLocalSchema> & {
  minify: MinifyMode;
};

export async function fetchMultipleGitHubFileContents(
  args: ToolExecutionArgs<FileContentInputQuery>
): Promise<CallToolResult> {
  const { queries, authInfo } = args;
  const getProviderContext = createLazyProviderContext(authInfo);

  return executeBulkOperation(
    queries,
    async (query: FileContentInputQuery, _index: number) => {
      try {
        const parsed = safeParseOrError(FileContentQueryLocalSchema, query, {
          prefix: false,
        });
        if (parsed.ok === false) {
          return parsed.error;
        }

        const parsedData = parsed.data as z.output<
          typeof FileContentQueryLocalSchema
        >;

        const resolvedMinify: MinifyMode = parsedData.minify ?? 'none';
        const effectiveQuery: PartialFileContentQuery = {
          ...parsedData,
          minify: resolvedMinify,
        };

        return handleFileFetch(effectiveQuery, getProviderContext());
      } catch (error) {
        return handleCatchError(
          error,
          query,
          undefined,
          TOOL_NAMES.GITHUB_FETCH_CONTENT
        );
      }
    },
    {
      toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      finalize: buildGithubFetchContentFinalizer<FileContentInputQuery>(),
    },
    args
  );
}

async function handleFileFetch(
  query: PartialFileContentQuery,
  providerContext: ReturnType<typeof createProviderExecutionContext>
) {
  const providerResult = await executeProviderOperation(query, () =>
    providerContext.provider.getFileContent(mapFileContentToolQuery(query))
  );

  if (providerResult.ok === false) {
    return providerResult.result;
  }

  const resultData = mapFileContentProviderResult(
    providerResult.response.data,
    query
  );

  const hasContent = Boolean(
    providerResult.response.data.matchNotFound === true ||
    (providerResult.response.data.content &&
      providerResult.response.data.content.length > 0)
  );

  return createSuccessResult(
    query,
    resultData,
    hasContent,
    TOOL_NAMES.GITHUB_FETCH_CONTENT,
    {
      rawResponse: providerResult.response.rawResponseChars,
    }
  );
}
