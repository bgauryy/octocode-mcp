import type { ToolContinuation } from '../../scheme/pagination.js';
import type { ResponsePaginationInfo } from '../../types/toolOutput.js';

// ---------------------------------------------------------------------------
// Output TYPES — describes what the internal GitHub history router returns. No zod: the MCP
// server registers no outputSchema. Index signatures mirror the original
// .passthrough() (upstream + local) for additive runtime fields.
// ---------------------------------------------------------------------------

export interface PRChangedFile {
  path?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  [key: string]: unknown;
}

// Detail-mode PR/issue row. All fields optional (list mode returns a subset);
// the index signature keeps additive runtime fields valid.
export interface PRDetailRow {
  number?: number;
  title?: string;
  url?: string;
  state?: string;
  author?: string;
  targetBranch?: string;
  sourceBranch?: string;
  sourceSha?: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  mergedAt?: string;
  changedFilesCount?: number;
  additions?: number;
  deletions?: number;
  changedFiles?: PRChangedFile[];
  // Row-level continuations include non-ToolContinuation shapes (e.g.
  // `target` carries bare owner/repo/prNumber) — keep values open.
  next?: Record<string, unknown>;
  contentPagination?: Record<string, unknown>;
  [key: string]: unknown;
}

// concise:true returns flat "#N title" strings; full mode returns objects.
export type ConciseOrDetailRow = string | PRDetailRow;

export interface HistoryCommit {
  sha?: string;
  date?: string;
  message?: string;
  messageHeadline?: string;
  url?: string;
  author?: {
    name?: string;
    email?: string;
    login?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Commits-mode pagination omits totalPages (unbounded history walk), so the
// canonical ItemPagination (which requires it) does not fit here.
export interface HistoryPagination {
  currentPage?: number;
  totalPages?: number;
  perPage?: number;
  hasMore?: boolean;
  nextPage?: number;
  [key: string]: unknown;
}

export interface PullRequestsResultData {
  pullRequests?: ConciseOrDetailRow[];
  // type:"issues" reuses this tool; same concise/object shapes.
  issues?: ConciseOrDetailRow[];
  // Mode identity + scope echoed by commits/issues modes.
  type?: string;
  owner?: string;
  repo?: string;
  path?: string;
  totalCount?: number;
  effectiveQuery?: string;
  commits?: HistoryCommit[];
  pagination?: HistoryPagination;
  // Mode-irrelevant-field notices and other in-band guidance.
  // Continuations (readIssue / searchRepositoryCode / …).
  next?: Record<string, ToolContinuation>;
  [key: string]: unknown;
}

export interface GitHubSearchPullRequestsOutputLocal {
  base?: string;
  shared?: Record<string, string | number | boolean>;
  responsePagination?: ResponsePaginationInfo;
  next?: Record<string, ToolContinuation>;
  results?: Array<{
    id?: string;
    status?: string;
    data?: PullRequestsResultData;
    [key: string]: unknown;
  }>;
  // Upstream output schema is passthrough — allow additive top-level fields.
  [key: string]: unknown;
}
