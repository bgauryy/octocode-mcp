import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { RipgrepQuery } from './scheme.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { searchContentRipgrep } from './searchContentRipgrep.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

/**
 * Execute bulk ripgrep search operation.
 * Wraps searchContentRipgrep with bulk operation handling for multiple queries.
 */
export async function executeRipgrepSearch(
  args: ToolExecutionArgs<RipgrepQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: RipgrepQuery) => searchContentRipgrep(query),
    { toolName: TOOL_NAMES.LOCAL_RIPGREP }
  );
}
