import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ViewStructureQuery } from '../../utils/core/types.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { viewStructure } from './local_view_structure.js';

/**
 * Execute bulk view structure operation.
 * Wraps viewStructure with bulk operation handling for multiple queries.
 */
export async function executeViewStructure(args: {
  queries: ViewStructureQuery[];
}): Promise<CallToolResult> {
  return executeBulkOperation(
    args.queries || [],
    async (query: ViewStructureQuery) => viewStructure(query),
    { toolName: TOOL_NAMES.LOCAL_VIEW_STRUCTURE }
  );
}
