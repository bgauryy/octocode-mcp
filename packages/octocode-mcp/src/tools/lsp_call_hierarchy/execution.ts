import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LSPCallHierarchyQuery } from './scheme.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { processCallHierarchy } from './callHierarchy.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { TOOL_NAME } from './constants.js';
import { executeWithToolBoundary } from '../executionGuard.js';

export { TOOL_NAME };

/**
 * Execute bulk LSP call hierarchy operation.
 * Wraps processCallHierarchy with bulk operation handling for multiple queries.
 */
export async function executeCallHierarchy(
  args: ToolExecutionArgs<LSPCallHierarchyQuery>
): Promise<CallToolResult> {
  const { queries, responseCharOffset, responseCharLength } = args;

  return executeBulkOperation(
    queries || [],
    async (query: LSPCallHierarchyQuery) =>
      executeWithToolBoundary({
        toolName: TOOL_NAME,
        query,
        contextMessage: 'lspCallHierarchy execution failed',
        execute: async () => processCallHierarchy(query),
      }),
    {
      toolName: TOOL_NAME,
      responseCharOffset,
      responseCharLength,
    }
  );
}
