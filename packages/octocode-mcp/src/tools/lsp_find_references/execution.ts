import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LSPFindReferencesQuery } from './scheme.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { findReferences } from './lsp_find_references.js';
import type { ToolExecutionArgs } from '../../types/execution.js';

export const TOOL_NAME = TOOL_NAMES.LSP_FIND_REFERENCES;

/**
 * Execute bulk find references operation.
 * Wraps findReferences with bulk operation handling for multiple queries.
 */
export async function executeFindReferences(
  args: ToolExecutionArgs<LSPFindReferencesQuery>
): Promise<CallToolResult> {
  const { queries } = args;

  return executeBulkOperation(
    queries || [],
    async (query: LSPFindReferencesQuery) => findReferences(query),
    { toolName: TOOL_NAME }
  );
}
