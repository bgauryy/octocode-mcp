import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ViewStructureQuery } from '../../utils/core/types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { viewStructure } from './local_view_structure.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

/**
 * Execute bulk view structure operation.
 * Wraps viewStructure with bulk operation handling for multiple queries.
 */
export async function executeViewStructure(
  args: ToolExecutionArgs<ViewStructureQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: ViewStructureQuery) => viewStructure(query),
    { toolName: TOOL_NAMES.LOCAL_VIEW_STRUCTURE }
  );
}
