import { z } from 'zod';

import type {
  LocalItemPagination,
  ToolContinuation,
} from '../../../scheme/pagination.js';
import { GraphAnalysisQuerySchema } from '../../../toolContract/input/resources/tools/topologyOperation.js';
import type { GraphCoverage } from '../../../graph/types.js';

export { GraphAnalysisQuerySchema };

export type TopologyAnalysisQuery = z.infer<typeof GraphAnalysisQuerySchema>;

export type GraphOperation = TopologyAnalysisQuery['operation'];

export type DeadCodeReason =
  'unreachable-file' | 'unreferenced-export' | 'dead-cluster';

export interface DeadExportOutput {
  file: string;
  name: string;
  kind: string;
  line: number;
  reason: DeadCodeReason;
  clusterId?: number;
  viaHeuristic?: 'lexical-count' | 'reexport-chain';
}

export interface DeadClusterOutput {
  id: number;
  files: string[];
  reason: string;
}

export interface TopologyAnalysisOutput {
  coverage?: GraphCoverage;
  status?: 'empty' | 'error';
  error?: string;
  errorCode?: string;
  rawResponseChars?: number;
  operation?: GraphOperation;
  path?: string;
  filesScanned?: number;
  filesSkipped?: number;
  truncated?: boolean;
  terminalLimit?: boolean;
  completeness?: {
    results: 'complete' | 'pageable' | 'truncated';
    graph: 'complete' | 'scan-truncated' | 'coverage-incomplete';
    diagnostics: 'complete' | 'pageable' | 'truncated';
    coverageGapReasons?: Array<
      'parseRecovery' | 'unresolvedImports' | 'unsupportedLinking'
    >;
  };
  partialReasons?: Array<
    | 'maxFiles'
    | 'limit'
    | 'filesSkipped'
    | 'parseRecovery'
    | 'unresolvedImports'
    | 'unsupportedLinking'
    | 'diagnosticPage'
  >;
  totalAvailable?: number;
  results?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
  pagination?: LocalItemPagination;
  next?: Record<string, ToolContinuation>;
  warnings?: string[];
  confidence?: 'low';
  [key: string]: unknown;
}
