/**
 * Schema for local_fetch_content tool
 */

import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema.js';
import { TOOL_NAMES } from '../constants.js';

/**
 * Tool description for MCP registration
 */
export const LOCAL_FETCH_CONTENT_DESCRIPTION = `Fetch file content with partial read support for token optimization.

IMPORTANT:
- Use a maximum of 10,000 tokens per request.
- For large files, use partial reads (see Modes section below).
- Check file size before fetching it.

Modes:
• Full Content: fullContent=true (default) Returns the entire file (minified).
• Line Range: startLine=10, endLine=50 Returns a specific line range.
• Match String: matchString="function", matchStringContextLines=5 Returns pattern matches with context (BEST for semantic use).

Best Practices:
- matchString mode is the most token-efficient for semantic extraction.
- matchStringContextLines=5-15 balances context and token usage.
- Bulk queries are 5-10x faster for parallel fetching.
- minified=true (default) optimizes token usage.
- Progressive use: try matchString first, then line ranges if needed.`;

/**
 * Schema descriptions for fetch content parameters
 */
const FETCH_CONTENT_DESCRIPTIONS = {
  path: 'Absolute or relative file path to fetch content from',
  fullContent:
    'Return entire file content (token expensive for large files, use partial reads when possible)',
  startLine:
    'Start line number for partial read (must use with endLine) - efficient for reading specific sections',
  endLine:
    'End line number for partial read (must use with startLine) - efficient for reading specific sections',
  matchString:
    'Search pattern to find within the file - returns only matching sections with context (most efficient for targeted reads)',
  matchStringContextLines:
    'Lines of context to show around each match (1-50, default 5) - use with matchString for focused content retrieval',
  minified:
    'Minify content for token efficiency (removes extra whitespace, comments where safe)',
} as const;

/**
 * Single query schema for fetching file content
 */
export const FetchContentQuerySchema = BaseQuerySchema.extend({
  path: z.string().min(1).describe(FETCH_CONTENT_DESCRIPTIONS.path),

  fullContent: z
    .boolean()
    .default(false)
    .describe(FETCH_CONTENT_DESCRIPTIONS.fullContent),

  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(FETCH_CONTENT_DESCRIPTIONS.startLine),

  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(FETCH_CONTENT_DESCRIPTIONS.endLine),

  matchString: z
    .string()
    .optional()
    .describe(FETCH_CONTENT_DESCRIPTIONS.matchString),

  matchStringContextLines: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5)
    .describe(FETCH_CONTENT_DESCRIPTIONS.matchStringContextLines),

  minified: z
    .boolean()
    .optional()
    .default(true)
    .describe(FETCH_CONTENT_DESCRIPTIONS.minified),
});

/**
 * Bulk query schema for fetching multiple file contents
 */
export const BulkFetchContentSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_FETCH_CONTENT,
  FetchContentQuerySchema
);

export type FetchContentQuery = z.infer<typeof FetchContentQuerySchema>;
export type BulkFetchContentRequest = z.infer<typeof BulkFetchContentSchema>;
