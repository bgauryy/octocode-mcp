import { DIRECT_TOOL_AUTO_FILLED_FIELDS } from '@octocodeai/octocode-core/schema';
/**
 * Canonical pagination schemas for all direct tools.
 *
 * Single source of truth — every tool output schema composes from these.
 * No compatibility aliases: each concept has exactly one name.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Item pagination — for search results, directory listings, archive entries
// ---------------------------------------------------------------------------

// Tool-specific pagination extras (perPage, totalFound, …) listed explicitly so
// MCP structuredContent validation accepts live envelopes without loosening
// assignability of typed pagination records via .passthrough().
export const ItemPaginationSchema = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  hasMore: z.boolean(),
  nextPage: z.number().optional(),
  pageSize: z.number().optional(),
  totalItems: z.number().optional(),
  perPage: z.number().optional(),
  totalFound: z.number().optional(),
  returned: z.number().optional(),
  totalMatches: z.number().optional(),
  reportedTotalMatches: z
    .number()
    .optional()
    .describe(
      "Provider-reported raw total (e.g. GitHub's match count) — may exceed what pagination can actually reach."
    ),
  reachableTotalMatches: z
    .number()
    .optional()
    .describe(
      "Matches reachable by walking pages (bounded by the provider's result window, e.g. GitHub caps at 1000); totalPages is computed from this, not from reportedTotalMatches."
    ),
  totalMatchesKind: z.enum(['exact', 'reported', 'lowerBound']).optional(),
  totalMatchesCapped: z.boolean().optional(),
  // LSP / local list envelopes
  totalResults: z.number().optional(),
  itemsPerPage: z.number().optional(),
});

export type ItemPagination = z.infer<typeof ItemPaginationSchema>;

// ---------------------------------------------------------------------------
// Char pagination — for history bodies, patches, and archive extraction
// ---------------------------------------------------------------------------

export const CharPaginationSchema = z.object({
  charOffset: z.number(),
  charLength: z.number(),
  totalChars: z.number(),
  hasMore: z.boolean(),
  nextCharOffset: z.number().optional(),
  currentPage: z.number().optional(),
  totalPages: z.number().optional(),
  chunkMode: z.enum(['semantic', 'char-limit']).optional(),
  pageCountsKind: z.literal('estimated').optional(),
});

export type CharPagination = z.infer<typeof CharPaginationSchema>;

// ---------------------------------------------------------------------------
// Continuation — machine-ready next-call descriptor
// ---------------------------------------------------------------------------

export const ToolContinuationSchema = z.object({
  tool: z.string(),
  query: z.record(z.string(), z.unknown()),
  why: z.string().optional(),
  confidence: z.enum(['exact', 'high', 'medium', 'low']).optional(),
});

export type ToolContinuation = z.infer<typeof ToolContinuationSchema>;

/** Runtime item-pagination fields used by local tools (aliases of pageSize/totalItems). */
export const LocalItemPaginationSchema = ItemPaginationSchema.extend({
  filesPerPage: z.number().optional(),
  entriesPerPage: z.number().optional(),
  matchesPerPage: z.number().optional(),
  totalFiles: z.number().optional(),
  totalEntries: z.number().optional(),
  totalMatches: z.number().optional(),
  totalFilesFound: z.number().optional(),
  nextMatchPage: z.number().optional(),
});

export type LocalItemPagination = z.infer<typeof LocalItemPaginationSchema>;

/**
 * Auto-filled per-call metadata that the direct-tool executor injects into every
 * query (goal and reasoning). These are NOT real query parameters, so
 * they must be stripped from a replayable continuation — otherwise an agent that
 * runs `next` resends stale meta from the originating call.
 * Uses the canonical direct-tool auto-filled fields.
 */

function stripAutoFilledMeta(
  query: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([key, value]) =>
        value !== undefined && !DIRECT_TOOL_AUTO_FILLED_FIELDS.has(key)
    )
  );
}

/**
 * Build a machine-ready next-page continuation for tool queries.
 * Callers pass the full original query with the advanced page field already set;
 * auto-filled per-call metadata is stripped so the continuation is cleanly replayable.
 */
export function buildNextPageContinuation(
  tool: string,
  query: Record<string, unknown>,
  why = 'Continue to the next page of results.'
): ToolContinuation {
  return {
    tool,
    query: stripAutoFilledMeta(query),
    why,
    confidence: 'exact',
  };
}
