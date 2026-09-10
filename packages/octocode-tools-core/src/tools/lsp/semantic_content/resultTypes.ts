import type { ConsumerWarmupStats } from '../shared/semanticTypes.js';
import type {
  ItemPagination,
  ToolContinuation,
} from '../../../scheme/pagination.js';
import type { BulkToolOutput } from '../../../types/toolOutput.js';
import type {
  CompactCall,
  CompactCallTarget,
} from '../shared/semanticCallTypes.js';

// ---------------------------------------------------------------------------
// Output TYPES — describes what lspSearch returns per query result row.
// No zod: the MCP server registers no outputSchema, so the output is a plain
// type. Shared envelope lives in types/toolOutput.ts.
// ---------------------------------------------------------------------------

interface LspLocation {
  uri: string;
  absolutePath?: string;
  path?: string;
  content?: string;
  displayRange?: { startLine: number; endLine: number };
  isDefinition?: boolean;
}

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface LspResolvedSymbol {
  name: string;
  uri: string;
  absolutePath?: string;
  path?: string;
  foundAtLine: number;
  orderHint?: number;
}

interface LspInfo {
  serverAvailable?: boolean;
  provider?: string;
  source?: string;
}

type LspEmptyCategory =
  | 'unsupportedOperation'
  | 'symbolNotFound'
  | 'anchorFailed'
  | 'paginationChanged'
  | 'paginationSnapshotRequired'
  | 'noLocations'
  | 'noReferences'
  | 'noHover'
  | 'noCalls'
  | 'noWorkspaceSymbols'
  | 'noTypeHierarchy'
  | 'noDiagnostics';

interface LspEmptyState {
  category: LspEmptyCategory;
  reason: string;
}

interface LspCompleteness {
  complete: boolean;
  consumerWarmupIncomplete?: true;
  truncatedByDepth: boolean;
  truncatedByBudget?: boolean;
  visitedNodeCount?: number;
  requestCount?: number;
  cycleCount: number;
  failedRequestCount: number;
  dynamicCallsExcluded: true;
  stdlibCallsExcluded?: number;
}

interface LspCompactSymbol {
  name: string;
  kind: string;
  line: number;
  character: number;
  endLine: number;
  childCount: number;
  containerName?: string;
}

interface LspReferencesByFile {
  uri: string;
  absolutePath?: string;
  path?: string;
  count: number;
  firstLine: number;
  firstCharacter: number;
  lines: number[];
  hasDefinition?: boolean;
}

// Row variants (LocationRow, CompactSymbolRow, …) are plain strings.
type LspSemanticPayload =
  | { kind: 'definition'; locations: Array<LspLocation | string> }
  | { kind: 'typeDefinition'; locations: Array<LspLocation | string> }
  | {
      kind: 'implementation';
      locations: Array<LspLocation | string>;
      warmup?: ConsumerWarmupStats;
    }
  | {
      kind: 'references';
      locations?: Array<LspLocation | string>;
      byFile?: Array<LspReferencesByFile | string>;
      totalReferences: number;
      totalFiles: number;
      definitionOnly?: boolean;
      warmup?: ConsumerWarmupStats;
      empty?: LspEmptyState;
    }
  | {
      kind: 'callers' | 'callees' | 'callHierarchy';
      root?: CompactCallTarget | string;
      direction: 'incoming' | 'outgoing' | 'both';
      calls: Array<CompactCall | string>;
      incomingCalls: number;
      outgoingCalls: number;
      warmup?: ConsumerWarmupStats;
      completeness: LspCompleteness;
      empty?: LspEmptyState;
    }
  | { kind: 'hover'; markdown?: string; text?: string; range?: LspRange }
  | {
      kind: 'documentSymbols';
      symbols: Array<LspCompactSymbol | string>;
      totalSymbols?: number;
      topLevelSymbols?: number;
      empty?: LspEmptyState;
    }
  | {
      kind: 'workspaceSymbol';
      query: string;
      symbols: unknown[];
      totalSymbols: number;
      empty?: LspEmptyState;
    }
  | {
      kind: 'typeHierarchy';
      direction: 'supertypes' | 'subtypes';
      root?: unknown;
      items: unknown[];
      totalItems: number;
      empty?: LspEmptyState;
    }
  | {
      kind: 'diagnostic';
      diagnostics: unknown[];
      totalDiagnostics: number;
      errorCount: number;
      warningCount: number;
      empty?: LspEmptyState;
    }
  | {
      kind: 'empty';
      category: LspEmptyCategory;
      reason: string;
      warmup?: ConsumerWarmupStats;
    };

export interface LspSearchData {
  type: string;
  uri: string;
  absolutePath?: string;
  path?: string;
  format?: 'structured' | 'compact';
  resolvedSymbol?: LspResolvedSymbol;
  // Omitted on early-return paths (e.g. symbolNotFound) where the LSP server is
  // never engaged; present on any path that reached a provider.
  lsp?: LspInfo;
  payload: LspSemanticPayload;
  pagination?: ItemPagination & { snapshot?: string };
  snapshot?: { expected?: string; actual?: string };
  summary?: Record<string, unknown>;
  // Ready-to-run follow-ups (e.g. next.readSite).
  next?: Record<string, ToolContinuation>;
  hints?: string[];
}

export type LspSearchOutput = BulkToolOutput<LspSearchData>;
