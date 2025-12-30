/**
 * Schema for localGetFileContent tool
 */

import { z } from 'zod';
import { BaseQuerySchemaLocal, createBulkQuerySchema } from './baseSchema.js';
import {
  LOCAL_FETCH_CONTENT,
  TOOL_NAMES,
  DESCRIPTIONS,
} from '../tools/toolMetadata.js';

/**
 * Tool description for localGetFileContent
 */
export const LOCAL_FETCH_CONTENT_DESCRIPTION =
  DESCRIPTIONS[TOOL_NAMES.LOCAL_FETCH_CONTENT] ||
  'Read file content with optional pattern matching';

/**
 * Single query schema for fetching file content
 */
export const FetchContentQuerySchema = BaseQuerySchemaLocal.extend({
  path: z.string().min(1).describe(LOCAL_FETCH_CONTENT.scope.path),

  fullContent: z
    .boolean()
    .default(false)
    .describe(LOCAL_FETCH_CONTENT.options.fullContent),

  matchString: z
    .string()
    .optional()
    .describe(LOCAL_FETCH_CONTENT.options.matchString),

  matchStringContextLines: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5)
    .describe(LOCAL_FETCH_CONTENT.options.matchStringContextLines),

  matchStringIsRegex: z
    .boolean()
    .optional()
    .default(false)
    .describe(LOCAL_FETCH_CONTENT.options.matchStringIsRegex),

  matchStringCaseSensitive: z
    .boolean()
    .optional()
    .default(false)
    .describe(LOCAL_FETCH_CONTENT.options.matchStringCaseSensitive),

  minified: z
    .boolean()
    .optional()
    .default(true)
    .describe(LOCAL_FETCH_CONTENT.options.minified),

  charOffset: z
    .number()
    .min(0)
    .optional()
    .describe(LOCAL_FETCH_CONTENT.pagination.charOffset),

  charLength: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe(LOCAL_FETCH_CONTENT.pagination.charLength),
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
