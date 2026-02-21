/**
 * Types for lsp_goto_definition tool (lspGotoDefinition)
 * @module tools/lsp_goto_definition/types
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for LSP goto definition
 */
export interface LSPGotoDefinitionQuery {
  uri: string;
  symbolName: string;
  lineHint: number;
  orderHint?: number;
  contextLines?: number;
  charOffset?: number;
  charLength?: number;
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
 * Code snippet with location information
 */
export interface CodeSnippet {
  uri: string;
  range: LSPRange;
  content: string;
  symbolKind?: SymbolKind;
  displayRange?: {
    startLine: number;
    endLine: number;
  };
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
 * Result of LSP goto definition
 */
export interface GotoDefinitionResult {
  status: 'hasResults' | 'empty' | 'error';
  error?: string;
  errorType?: LSPErrorType;
  hints?: string[];
  researchGoal?: string;
  reasoning?: string;
  locations?: CodeSnippet[];
  resolvedPosition?: ExactPosition;
  searchRadius?: number;
  outputPagination?: {
    charOffset: number;
    charLength: number;
    totalChars: number;
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
  };
  [key: string]: unknown;
}
