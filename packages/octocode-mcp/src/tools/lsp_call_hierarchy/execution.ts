import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LSPCallHierarchyQuery } from './scheme.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { processCallHierarchy } from './callHierarchy.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY;

/**
 * Execute bulk LSP call hierarchy operation.
 * Wraps processCallHierarchy with bulk operation handling for multiple queries.
 */
export async function executeCallHierarchy(args: {
  queries: LSPCallHierarchyQuery[];
}): Promise<CallToolResult> {
  return executeBulkOperation(
    args.queries || [],
    async (query: LSPCallHierarchyQuery) => processCallHierarchy(query),
    { toolName: TOOL_NAME }
  );
}
