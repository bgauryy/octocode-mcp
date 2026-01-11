import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LSPFindReferencesQuery } from './scheme.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import { findReferences } from './lsp_find_references.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_FIND_REFERENCES;

/**
 * Execute bulk find references operation.
 * Wraps findReferences with bulk operation handling for multiple queries.
 */
export async function executeFindReferences(args: {
  queries: LSPFindReferencesQuery[];
}): Promise<CallToolResult> {
  return executeBulkOperation(
    args.queries || [],
    async (query: LSPFindReferencesQuery) => findReferences(query),
    { toolName: TOOL_NAME }
  );
}
