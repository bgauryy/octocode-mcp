/**
 * Types for lsp_call_hierarchy tool (lspCallHierarchy)
 * @module tools/lsp_call_hierarchy/types
 */

import type {
  LspCallHierarchyItem,
  LspCallHierarchyToolResult,
  LspIncomingCall,
  LspOutgoingCall,
} from '@octocodeai/octocode-core';

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

export type CallHierarchyItem = LspCallHierarchyItem;

export type IncomingCall = LspIncomingCall;

export type OutgoingCall = LspOutgoingCall;

export type CallHierarchyResult = LspCallHierarchyToolResult;
