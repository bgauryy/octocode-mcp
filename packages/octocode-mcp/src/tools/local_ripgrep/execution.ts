import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { RipgrepQuery } from './scheme.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { searchContentRipgrep } from './searchContentRipgrep.js';

/**
 * Execute bulk ripgrep search operation.
 * Wraps searchContentRipgrep with bulk operation handling for multiple queries.
 */
export async function executeRipgrepSearch(args: {
  queries: RipgrepQuery[];
}): Promise<CallToolResult> {
  return executeBulkOperation(
    args.queries || [],
    async (query: RipgrepQuery) => searchContentRipgrep(query),
    { toolName: TOOL_NAMES.LOCAL_RIPGREP }
  );
}
