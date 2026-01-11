import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { GITHUB_FETCH_CONTENT, TOOL_NAMES } from '../toolMetadata.js';

const FileContentBaseSchema = BaseQuerySchema.extend({
  owner: z.string().min(1).max(200).describe(GITHUB_FETCH_CONTENT.scope.owner),
  repo: z.string().min(1).max(150).describe(GITHUB_FETCH_CONTENT.scope.repo),
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
  charOffset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(GITHUB_FETCH_CONTENT.pagination.charOffset),
  charLength: z
    .number()
    .int()
    .min(50)
    .max(50000)
    .optional()
    .describe(GITHUB_FETCH_CONTENT.pagination.charLength),
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

type _FileContentQuery = z.infer<typeof FileContentQuerySchema>;

export const FileContentBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_FETCH_CONTENT,
  FileContentQuerySchema
);
