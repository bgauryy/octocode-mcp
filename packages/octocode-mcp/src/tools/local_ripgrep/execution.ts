import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type RipgrepQuery, RipgrepQuerySchema } from './scheme.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { searchContentRipgrep } from './searchContentRipgrep.js';
import { createErrorResult } from '../utils.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

/**
 * Execute bulk ripgrep search operation.
 * Wraps searchContentRipgrep with bulk operation handling for multiple queries.
 * Validates each query individually so one invalid query doesn't block the batch.
 */
export async function executeRipgrepSearch(
  args: ToolExecutionArgs<RipgrepQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: RipgrepQuery) => {
      const validation = RipgrepQuerySchema.safeParse(query);
      if (!validation.success) {
        const messages = validation.error.issues.map(i => i.message).join('; ');
        return createErrorResult(`Validation error: ${messages}`, query);
      }
      return searchContentRipgrep(query);
    },
    { toolName: TOOL_NAMES.LOCAL_RIPGREP }
  );
}
