import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { FetchContentQuery } from '../../utils/core/types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { fetchContent } from './fetchContent.js';
import { FetchContentQuerySchema } from './scheme.js';
import { createErrorResult } from '../utils.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

/**
 * Execute bulk fetch content operation.
 * Wraps fetchContent with bulk operation handling for multiple queries.
 * Validates each query individually so one invalid query doesn't block the batch.
 */
export async function executeFetchContent(
  args: ToolExecutionArgs<FetchContentQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: FetchContentQuery) => {
      const validation = FetchContentQuerySchema.safeParse(query);
      if (!validation.success) {
        const messages = validation.error.issues.map(i => i.message).join('; ');
        return createErrorResult(`Validation error: ${messages}`, query);
      }
      return fetchContent(query);
    },
    { toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT }
  );
}
