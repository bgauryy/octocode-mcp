/**
 * Types for lsp_find_references tool (lspFindReferences)
 * @module tools/lsp_find_references/types
 */

import type {
  LspFindReferencesPagination,
  LspFindReferencesToolResult,
  LspReferenceLocation,
} from '@octocodeai/octocode-core';

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

export type ReferenceLocation = LspReferenceLocation;

export type LSPPaginationInfo = LspFindReferencesPagination;

export type FindReferencesResult = LspFindReferencesToolResult;
