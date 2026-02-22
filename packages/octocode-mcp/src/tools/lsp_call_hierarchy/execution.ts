import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LSPCallHierarchyQuery } from './scheme.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { processCallHierarchy } from './callHierarchy.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

export const TOOL_NAME = TOOL_NAMES.LSP_CALL_HIERARCHY;

/**
 * Execute bulk LSP call hierarchy operation.
 * Wraps processCallHierarchy with bulk operation handling for multiple queries.
 */
export async function executeCallHierarchy(
  args: ToolExecutionArgs<LSPCallHierarchyQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: LSPCallHierarchyQuery) => processCallHierarchy(query),
    { toolName: TOOL_NAME }
  );
}
