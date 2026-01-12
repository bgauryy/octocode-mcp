import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { FetchContentQuery } from '../../utils/core/types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { fetchContent } from './fetchContent.js';

/**
 * Execute bulk fetch content operation.
 * Wraps fetchContent with bulk operation handling for multiple queries.
 */
export async function executeFetchContent(args: {
  queries: FetchContentQuery[];
}): Promise<CallToolResult> {
  return executeBulkOperation(
    args.queries || [],
    async (query: FetchContentQuery) => fetchContent(query),
    { toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT }
  );
}
