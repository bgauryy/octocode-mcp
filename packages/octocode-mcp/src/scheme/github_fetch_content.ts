import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_FETCH_CONTENT, TOOL_NAMES } from '../tools/toolMetadata';

const FileContentBaseSchema = BaseQuerySchema.extend({
  owner: z.string().min(1).max(200).describe(GITHUB_FETCH_CONTENT.scope.owner),
  repo: z.string().min(1).max(150).describe(GITHUB_FETCH_CONTENT.scope.repo),
  minified: z
    .boolean()
    .optional()
    .default(true)
    .describe(GITHUB_FETCH_CONTENT.processing.minified),
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
  addTimestamp: z
    .boolean()
    .optional()
    .default(true)
    .describe(GITHUB_FETCH_CONTENT.processing.addTimestamp),
});

export const FileContentQuerySchema = FileContentBaseSchema.superRefine(
  (data, ctx) => {
    if (
      data.fullContent &&
      (data.startLine || data.endLine || data.matchString)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: GITHUB_FETCH_CONTENT.validation.parameterConflict,
        path: ['fullContent'],
      });
    }
    if (
      (data.startLine && !data.endLine) ||
      (!data.startLine && data.endLine)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: GITHUB_FETCH_CONTENT.validation.parameterConflict,
        path: ['startLine'],
      });
    }
  }
);

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;

export const FileContentBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_FETCH_CONTENT,
  FileContentQuerySchema
);
