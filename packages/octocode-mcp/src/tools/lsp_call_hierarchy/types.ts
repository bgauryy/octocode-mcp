/**
 * Types for lsp_call_hierarchy tool (lspCallHierarchy)
 * @module tools/lsp_call_hierarchy/types
 */

import type {
  LspCallHierarchyItem,
  LspCallHierarchyPagination,
  LspCallHierarchyToolResult,
  LspExactPosition,
  LspIncomingCall,
  LspOutgoingCall,
  LspRange,
  LspSymbolKind,
} from '../../scheme/outputTypes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for LSP call hierarchy
 */
export interface LSPCallHierarchyQuery {
  id?: string;
  uri: string;
  symbolName: string;
  lineHint: number;
  direction: 'incoming' | 'outgoing';
  orderHint?: number;
  contextLines?: number;
  depth?: number;
  page?: number;
  callsPerPage?: number;
  charOffset?: number;
  charLength?: number;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// SHARED LSP TYPES
// ============================================================================

export type ExactPosition = LspExactPosition;

export type LSPRange = LspRange;

export type SymbolKind = LspSymbolKind;

export type CallHierarchyItem = LspCallHierarchyItem;

export type IncomingCall = LspIncomingCall;

export type OutgoingCall = LspOutgoingCall;

export type LSPPaginationInfo = LspCallHierarchyPagination;

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * LSP error types
 */
export type LSPErrorType =
  | 'symbol_not_found'
  | 'file_not_found'
  | 'not_a_function'
  | 'timeout'
  | 'parse_error'
  | 'unknown';

export type CallHierarchyResult = LspCallHierarchyToolResult;
