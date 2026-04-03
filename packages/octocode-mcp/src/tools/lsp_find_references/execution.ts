import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LSPFindReferencesQuery } from './scheme.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { findReferences } from './lsp_find_references.js';
import type { ToolExecutionArgs } from '../../types/execution.js';
import { TOOL_NAME } from './constants.js';
import { executeWithToolBoundary } from '../executionGuard.js';

export { TOOL_NAME };

/**
 * Execute bulk find references operation.
 * Wraps findReferences with bulk operation handling for multiple queries.
 */
export async function executeFindReferences(
  args: ToolExecutionArgs<LSPFindReferencesQuery>
): Promise<CallToolResult> {
  const { queries, responseCharOffset, responseCharLength } = args;

  return executeBulkOperation(
    queries || [],
    async (query: LSPFindReferencesQuery) =>
      executeWithToolBoundary({
        toolName: TOOL_NAME,
        query,
        contextMessage: 'lspFindReferences execution failed',
        execute: async () => findReferences(query),
      }),
    {
      toolName: TOOL_NAME,
      responseCharOffset,
      responseCharLength,
    }
  );
}
