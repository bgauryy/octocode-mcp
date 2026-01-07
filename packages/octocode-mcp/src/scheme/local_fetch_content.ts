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
  `## Read file content with optional pattern matching
<when>
- Read specific file content after locating it with search
- Extract specific sections using matchString or line ranges
- Get context around a known pattern
</when>
<when_NOT>
- DON'T use for searching across files → use localSearchCode
- DON'T use fullContent on large files → use matchString or charLength
</when_NOT>
<strategies>
- matchString: Find and extract around a pattern (preferred for large files)
- startLine/endLine: Extract known line range
- fullContent: Read entire file (only for small files)
- charOffset/charLength: Paginate through large files
</strategies>
<defaults>
- matchStringContextLines: 5 (lines around each match)
- fullContent: false
</defaults>
<common_patterns>
# Read function implementation
matchString="function targetFunction", matchStringContextLines=20

# Read class definition
matchString="class ClassName", matchStringContextLines=30

# Read specific line range (1-indexed)
startLine=10, endLine=50

# Paginate large file
charOffset=0, charLength=5000, then charOffset=5000
</common_patterns>`;

/**
 * Base schema for fetching file content (before refinement)
 */
const FetchContentBaseSchema = BaseQuerySchemaLocal.extend({
  path: z.string().min(1).describe(LOCAL_FETCH_CONTENT.scope.path),

  fullContent: z
    .boolean()
    .default(false)
    .describe(LOCAL_FETCH_CONTENT.options.fullContent),

  // Line range extraction (aligned with GitHub's githubGetFileContent)
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      LOCAL_FETCH_CONTENT.range?.startLine ??
        'Start line (1-indexed). Use with endLine for line range extraction.'
    ),

  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      LOCAL_FETCH_CONTENT.range?.endLine ??
        'End line (1-indexed, inclusive). Use with startLine for line range extraction.'
    ),

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
 * Single query schema for fetching file content with validation
 */
export const FetchContentQuerySchema = FetchContentBaseSchema.superRefine(
  (data, ctx) => {
    // startLine and endLine must be used together
    if (
      (data.startLine !== undefined && data.endLine === undefined) ||
      (data.startLine === undefined && data.endLine !== undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startLine and endLine must be used together',
        path: ['startLine'],
      });
    }

    // startLine must be <= endLine
    if (
      data.startLine !== undefined &&
      data.endLine !== undefined &&
      data.startLine > data.endLine
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startLine must be less than or equal to endLine',
        path: ['startLine'],
      });
    }

    // Cannot use startLine/endLine with matchString
    if (
      (data.startLine !== undefined || data.endLine !== undefined) &&
      data.matchString !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Cannot use startLine/endLine with matchString - choose one extraction method',
        path: ['startLine'],
      });
    }

    // Cannot use startLine/endLine with fullContent
    if (
      (data.startLine !== undefined || data.endLine !== undefined) &&
      data.fullContent === true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Cannot use startLine/endLine with fullContent - line extraction is partial by definition',
        path: ['fullContent'],
      });
    }
  }
);

/**
 * Bulk query schema for fetching multiple file contents
 */
export const BulkFetchContentSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_FETCH_CONTENT,
  FetchContentQuerySchema,
  { maxQueries: 5 }
);

type FetchContentQuery = z.infer<typeof FetchContentQuerySchema>;
type BulkFetchContentRequest = z.infer<typeof BulkFetchContentSchema>;
