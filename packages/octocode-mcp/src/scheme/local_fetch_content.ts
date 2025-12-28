/**
 * Schema for localGetFileContent tool
 */

import { z } from 'zod';
import {
  BaseQuerySchemaLocal,
  createBulkQuerySchema,
  COMMON_PAGINATION_DESCRIPTIONS,
} from './baseSchema.js';
import { TOOL_NAMES } from '../tools/toolMetadata.js';

/**
 * Tool description for MCP registration
 */
export const LOCAL_FETCH_CONTENT_DESCRIPTION = `Purpose: Read targeted file sections or paginated content.

Use when: You have a path (from ripgrep/find_files). Not for discovery.
Workflow: Prefer matchString (+context). For full file, use charLength.
Large files: Avoid fullContent without charLength; prefer matchString.
Tips: minified=true (default) to reduce tokens; batch queries when safe.

Examples:
- matchString: "class UserService", matchStringContextLines: 5
- matchString: "export.*function", matchStringIsRegex: true
- fullContent: true, charLength: 5000, charOffset: 0
`;

/**
 * Schema descriptions for fetch content parameters
 */
const FETCH_CONTENT_DESCRIPTIONS = {
  path: 'File path (absolute or relative).',
  fullContent:
    'Return entire file (token-expensive; prefer matchString for sections).',
  matchString:
    'Search pattern — returns matches with context (token-efficient; pairs well with ripgrep).',
  matchStringContextLines: 'Context lines around matches (1–50, default 5).',
  minified: 'Minify content for token efficiency (default true).',
} as const;

/**
 * Single query schema for fetching file content
 */
export const FetchContentQuerySchema = BaseQuerySchemaLocal.extend({
  path: z.string().min(1).describe(FETCH_CONTENT_DESCRIPTIONS.path),

  fullContent: z
    .boolean()
    .default(false)
    .describe(
      'Return entire file. For large files, use with charLength for pagination.'
    ),

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

  matchStringIsRegex: z
    .boolean()
    .optional()
    .default(false)
    .describe('Treat matchString as regex (default: false for literal).'),

  matchStringCaseSensitive: z
    .boolean()
    .optional()
    .default(false)
    .describe('Case-sensitive matching (default: false).'),

  minified: z
    .boolean()
    .optional()
    .default(true)
    .describe(FETCH_CONTENT_DESCRIPTIONS.minified),

  charOffset: z
    .number()
    .min(0)
    .optional()
    .describe(COMMON_PAGINATION_DESCRIPTIONS.charOffset),

  charLength: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe(COMMON_PAGINATION_DESCRIPTIONS.charLength),
});

/**
 * Bulk query schema for fetching multiple file contents
 */
export const BulkFetchContentSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_FETCH_CONTENT,
  FetchContentQuerySchema,
  { maxQueries: 5 }
);

export type FetchContentQuery = z.infer<typeof FetchContentQuerySchema>;
export type BulkFetchContentRequest = z.infer<typeof BulkFetchContentSchema>;
