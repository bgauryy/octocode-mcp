/**
 * Hand-written output TYPES for the direct tools.
 *
 * Tools keep one shared TypeScript envelope generic plus a per-tool `data`
 * interface. These are static types: MCP currently publishes input schemas
 * without an outputSchema. Runtime finalizers shape the structured result and
 * its text representation; adapters consume that shared result.
 *
 * INPUT/query schemas are unaffected: those are registered and parsed, so they
 * stay as zod.
 */
import type { ToolResultMeta } from './toolResults.js';

import type { ResponsePaginationInfo } from './bulk.js';
export type { ResponsePaginationInfo } from './bulk.js';

/** One result row in a bulk tool response. */
export interface BulkToolResultRow<TData> {
  /** Zero-based position of the originating query in the submitted batch. */
  index: number;
  status?: 'empty' | 'error';
  /** Present only when the primary response payload was served from cache. */
  cache?: 1;
  meta?: ToolResultMeta;
  data: TData;
}

/** The shared bulk envelope every direct tool returns, parameterized by its per-query `data` payload. */
export interface BulkToolOutput<TData> {
  results: Array<BulkToolResultRow<TData>>;
  base?: string;
  shared?: Record<string, string | number | boolean>;
  responsePagination?: ResponsePaginationInfo;
}
