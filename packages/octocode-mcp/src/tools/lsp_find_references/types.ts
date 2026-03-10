/**
 * Types for lsp_find_references tool (lspFindReferences)
 * @module tools/lsp_find_references/types
 */

import type {
  LspCodeSnippet,
  LspExactPosition,
  LspFindReferencesPagination,
  LspFindReferencesToolResult,
  LspRange,
  LspReferenceLocation,
  LspSymbolKind,
} from '../../scheme/outputTypes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Query parameters for LSP find references
 */
export interface LSPFindReferencesQuery {
  id?: string;
  uri: string;
  symbolName: string;
  lineHint: number;
  orderHint?: number;
  contextLines?: number;
  includeDeclaration?: boolean;
  page?: number;
  referencesPerPage?: number;
  includePattern?: string[];
  excludePattern?: string[];
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// SHARED LSP TYPES
// ============================================================================

export type ExactPosition = LspExactPosition;

export type LSPRange = LspRange;

export type SymbolKind = LspSymbolKind;

export type CodeSnippet = LspCodeSnippet;

export type ReferenceLocation = LspReferenceLocation;

export type LSPPaginationInfo = LspFindReferencesPagination;

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

export type FindReferencesResult = LspFindReferencesToolResult;
