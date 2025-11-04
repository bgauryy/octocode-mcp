import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_FETCH_CONTENT } from './schemDescriptions';
import { TOOL_NAMES } from '../constants';

export const FileContentQuerySchema = BaseQuerySchema.extend({
  owner: z.string().min(1).max(200).describe(GITHUB_FETCH_CONTENT.scope.owner),
  repo: z.string().min(1).max(150).describe(GITHUB_FETCH_CONTENT.scope.repo),
  minified: z
    .boolean()
    .optional()
    .default(true)
    .describe(GITHUB_FETCH_CONTENT.processing.minified),
  sanitize: z
    .boolean()
    .optional()
    .default(true)
    .describe(GITHUB_FETCH_CONTENT.processing.sanitize),
  path: z.string().describe(GITHUB_FETCH_CONTENT.scope.path),
  branch: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(GITHUB_FETCH_CONTENT.scope.branch),
  fullContent: z
    .boolean()
    .default(false)
    .describe(GITHUB_FETCH_CONTENT.range.fullContent),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(GITHUB_FETCH_CONTENT.range.startLine),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(GITHUB_FETCH_CONTENT.range.endLine),
  matchString: z
    .string()
    .optional()
    .describe(GITHUB_FETCH_CONTENT.range.matchString),
  matchStringContextLines: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5)
    .describe(GITHUB_FETCH_CONTENT.range.matchStringContextLines),
}).refine(
  data => {
    // When fullContent is true, other range parameters should not be used
    if (
      data.fullContent &&
      (data.startLine || data.endLine || data.matchString)
    ) {
      return false;
    }
    // When using line ranges, both startLine and endLine must be provided together
    if (
      (data.startLine && !data.endLine) ||
      (!data.startLine && data.endLine)
    ) {
      return false;
    }
    return true;
  },
  {
    message:
      'PARAMETER CONFLICT: Cannot use fullContent with startLine/endLine/matchString. Choose either: (1) fullContent=true for entire file, (2) startLine+endLine for line range, or (3) matchString for pattern-based extraction. Hint: For large files, prefer matchString (most efficient) over fullContent.',
  }
);

export const FileContentBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_FETCH_CONTENT,
  FileContentQuerySchema
);
