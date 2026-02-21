/**
 * Schema for localGetFileContent tool
 */

import { z } from 'zod';
import {
  BaseQuerySchemaLocal,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import {
  LOCAL_FETCH_CONTENT,
  TOOL_NAMES,
  DESCRIPTIONS,
} from '../toolMetadata.js';

/**
 * Tool description for localGetFileContent
 */
export const LOCAL_FETCH_CONTENT_DESCRIPTION =
  DESCRIPTIONS[TOOL_NAMES.LOCAL_FETCH_CONTENT];

/**
 * Base schema for fetching file content (before refinement)
 */
const FetchContentBaseSchema = BaseQuerySchemaLocal.extend({
  path: z
    .string()
    .min(1)
    .max(4096)
    .refine(value => !value.includes('\0'), {
      message: 'path contains invalid null byte',
    })
    .describe(LOCAL_FETCH_CONTENT.scope.path),

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
    .max(2000)
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
    .int()
    .min(0)
    .optional()
    .describe(LOCAL_FETCH_CONTENT.pagination.charOffset),

  charLength: z
    .number()
    .int()
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

    // Cannot use fullContent with matchString
    if (data.fullContent === true && data.matchString !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Cannot use fullContent with matchString - choose one extraction method',
        path: ['fullContent'],
      });
    }

    if (
      data.matchStringIsRegex &&
      data.matchString !== undefined &&
      data.matchString.length > 1000
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Regex pattern too long. Use a shorter pattern (max 1000 chars in regex mode).',
        path: ['matchString'],
      });
    }
  }
);

/**
 * Permissive single-query schema (no cross-field refinements).
 * Used for the MCP inputSchema so that one invalid query in a batch
 * does not reject the entire request. Per-query validation with the
 * full FetchContentQuerySchema happens inside the execution handler.
 */
const FetchContentQuerySchemaPermissive = FetchContentBaseSchema;

/**
 * Bulk query schema for fetching multiple file contents.
 * Uses the permissive schema so Zod doesn't reject the whole batch
 * when a single query has cross-field validation errors (e.g.
 * startLine > endLine). Per-query validation is done in the handler.
 */
export const BulkFetchContentSchema = createBulkQuerySchema(
  TOOL_NAMES.LOCAL_FETCH_CONTENT,
  FetchContentQuerySchemaPermissive,
  { maxQueries: 5 }
);
