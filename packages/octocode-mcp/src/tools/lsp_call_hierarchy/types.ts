/**
 * Types for lsp_call_hierarchy tool (lspCallHierarchy)
 * @module tools/lsp_call_hierarchy/types
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for LSP call hierarchy
 */
export interface LSPCallHierarchyQuery {
  uri: string;
  symbolName: string;
  lineHint: number;
  direction: 'incoming' | 'outgoing';
  orderHint?: number;
  contextLines?: number;
  depth?: number;
  page?: number;
  callsPerPage?: number;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// SHARED LSP TYPES
// ============================================================================

/**
 * Exact position in a file (0-indexed for LSP compatibility)
 */
export interface ExactPosition {
  line: number;
  character: number;
}

/**
 * Range in a file (0-indexed)
 */
export interface LSPRange {
  start: ExactPosition;
  end: ExactPosition;
}

/**
 * Symbol kinds for LSP
 */
export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'property'
  | 'enum'
  | 'module'
  | 'namespace'
  | 'unknown';

/**
 * Call hierarchy item
 */
export interface CallHierarchyItem {
  name: string;
  kind: SymbolKind;
  uri: string;
  range: LSPRange;
  selectionRange: LSPRange;
  content?: string;
  displayRange?: {
    startLine: number;
    endLine: number;
  };
}

/**
 * Incoming call (who calls this function)
 */
export interface IncomingCall {
  from: CallHierarchyItem;
  fromRanges: LSPRange[];
}

/**
 * Outgoing call (what this function calls)
 */
export interface OutgoingCall {
  to: CallHierarchyItem;
  fromRanges: LSPRange[];
}

/**
 * Pagination info for LSP results
 */
export interface LSPPaginationInfo {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  hasMore: boolean;
  resultsPerPage: number;
}

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

/**
 * Result of LSP call hierarchy
 */
export interface CallHierarchyResult {
  status: 'hasResults' | 'empty' | 'error';
  error?: string;
  errorType?: LSPErrorType;
  hints?: string[];
  researchGoal?: string;
  reasoning?: string;
  item?: CallHierarchyItem;
  incomingCalls?: IncomingCall[];
  outgoingCalls?: OutgoingCall[];
  pagination?: LSPPaginationInfo;
  direction?: 'incoming' | 'outgoing';
  depth?: number;
  [key: string]: unknown;
}
