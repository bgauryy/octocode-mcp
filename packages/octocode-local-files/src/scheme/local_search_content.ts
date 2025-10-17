/**
 * Zod schema for local_search_content tool
 */

import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema.js';
import { TOOL_NAMES } from '../constants.js';

/**
 * Tool description for MCP registration
 */
export const LOCAL_SEARCH_CONTENT_DESCRIPTION = `Search file content using grep (unix text search tool).

Why: Fast pattern matching in code - find implementations, usage, strings, or patterns across files.

SEMANTIC: YOU are the semantic layer - translate user intent → multiple patterns → bulk parallel execution = instant semantic search. No embeddings!
Example: "auth flow?" → queries=[{pattern:"login|auth"}, {pattern:"session|token"}, {pattern:"password"}]

Examples:
• Semantic bulk: queries=[{pattern:"try|catch|error"}, {pattern:"throw|reject"}, {pattern:"Error\\("}]
• Multi-pattern: queries=[{pattern:"TODO"}, {pattern:"FIXME"}, {pattern:"BUG"}]
• Function calls: pattern="functionName\\(", regex=true, include=["*.ts"]
• Literal (3x faster): pattern="import React", fixedString=true
• Context aware: pattern="error", contextLines=3-5

Best Practices:
- Break user intent into multiple related patterns (synonyms, variations)
- Bulk queries = 5-10x faster, better semantic coverage
- Combine patterns: "auth|login|signin" for comprehensive search
- contextLines=3-5 for code flow understanding
- excludeDir=["node_modules","dist",".git"] to skip artifacts`;

/**
 * Search content query schema
 */
export const SearchContentQuerySchema = BaseQuerySchema.extend({
  pattern: z.string().describe('Search pattern (string or regex)'),
  path: z.string().describe('Directory to search (required)'),

  // Search scope filters
  include: z
    .array(z.string())
    .optional()
    .describe('File patterns to include (e.g., ["*.js", "*.ts"])'),
  exclude: z
    .array(z.string())
    .optional()
    .describe('File patterns to exclude (e.g., ["*.min.js", "*.test.js"])'),
  excludeDir: z
    .array(z.string())
    .optional()
    .describe(
      'Directories to exclude (e.g., ["node_modules", ".git", "dist"])'
    ),

  // Search behavior
  regex: z.boolean().optional().describe('Use extended regex (-E)'),
  perlRegex: z
    .boolean()
    .optional()
    .describe('Perl-compatible regex (-P) for advanced patterns'),
  fixedString: z
    .boolean()
    .optional()
    .describe('Literal string search (-F), faster for exact matches'),
  caseInsensitive: z
    .boolean()
    .optional()
    .describe('Case-insensitive search (-i)'),
  smartCase: z
    .boolean()
    .optional()
    .describe('Case-insensitive if pattern is lowercase, sensitive otherwise'),
  wholeWord: z.boolean().optional().describe('Match whole words only (-w)'),
  invertMatch: z.boolean().optional().describe('Show non-matching lines (-v)'),

  // Advanced filters
  binaryFiles: z
    .enum(['text', 'without-match', 'binary'])
    .optional()
    .describe('How to handle binary files (default: without-match)'),
  followSymlinks: z.boolean().optional().describe('Follow symbolic links'),

  // Context & output
  contextLines: z
    .number()
    .min(0)
    .max(20)
    .optional()
    .describe('Lines of context around match (-C): 0-20, default 3'),
  beforeLines: z
    .number()
    .min(0)
    .max(20)
    .optional()
    .describe('Lines before match (-B): 0-20'),
  afterLines: z
    .number()
    .min(0)
    .max(20)
    .optional()
    .describe('Lines after match (-A): 0-20'),
  lineNumbers: z
    .boolean()
    .default(true)
    .describe('Show line numbers (-n): default true'),
  filesOnly: z.boolean().optional().describe('List matching files only (-l)'),
  filesWithoutMatch: z
    .boolean()
    .optional()
    .describe('List files without matches (-L)'),
  count: z.boolean().optional().describe('Count matches per file (-c)'),
  maxCount: z
    .number()
    .optional()
    .describe('Stop after N matches per file (-m)'),

  // Performance
  limit: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe('Max results to return: 1-10000, default 1000'),
});

/**
 * Bulk search content schema
 */
export const BulkSearchContentSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_SEARCH_CONTENT,
  SearchContentQuerySchema
);

export type SearchContentQuery = z.infer<typeof SearchContentQuerySchema>;
export type BulkSearchContentQuery = z.infer<typeof BulkSearchContentSchema>;
