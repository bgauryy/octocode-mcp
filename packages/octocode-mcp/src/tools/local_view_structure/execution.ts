import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ViewStructureQuery } from '../../utils/core/types.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { viewStructure } from './local_view_structure.js';
import { ViewStructureQuerySchema } from './scheme.js';
import { createErrorResult } from '../utils.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

/**
 * Execute bulk view structure operation.
 * Wraps viewStructure with bulk operation handling for multiple queries.
 * Validates each query individually so one invalid query doesn't block the batch.
 */
export async function executeViewStructure(
  args: ToolExecutionArgs<ViewStructureQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: ViewStructureQuery) => {
      const validation = ViewStructureQuerySchema.safeParse(query);
      if (!validation.success) {
        const messages = validation.error.issues.map(i => i.message).join('; ');
        return createErrorResult(`Validation error: ${messages}`, query);
      }
      return viewStructure(query);
    },
    { toolName: TOOL_NAMES.LOCAL_VIEW_STRUCTURE }
  );
}
