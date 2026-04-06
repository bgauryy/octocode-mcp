/**
 * Types for lsp_goto_definition tool (lspGotoDefinition)
 * @module tools/lsp_goto_definition/types
 */

import type {
  LspCodeSnippet,
  LspExactPosition,
  LspGotoDefinitionToolResult,
  LspRange,
  LspSymbolKind,
} from '../../scheme/outputTypes.js';

/**
 * Query parameters for LSP goto definition
 */
export interface LSPGotoDefinitionQuery {
  id?: string;
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

export type ExactPosition = LspExactPosition;

export type LSPRange = LspRange;

export type SymbolKind = LspSymbolKind;

export type CodeSnippet = LspCodeSnippet;

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

export type GotoDefinitionResult = LspGotoDefinitionToolResult;
