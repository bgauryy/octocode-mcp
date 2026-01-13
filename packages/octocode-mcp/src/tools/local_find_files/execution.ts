import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { FindFilesQuery } from '../../utils/core/types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { findFiles } from './findFiles.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

/**
 * Execute bulk find files operation.
 * Wraps findFiles with bulk operation handling for multiple queries.
 */
export async function executeFindFiles(
  args: ToolExecutionArgs<FindFilesQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: FindFilesQuery) => findFiles(query),
    { toolName: TOOL_NAMES.LOCAL_FIND_FILES }
  );
}
