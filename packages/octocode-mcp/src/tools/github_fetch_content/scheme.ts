import { z } from 'zod/v4';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { GITHUB_FETCH_CONTENT } from '../toolMetadata/githubSchemaHelpers.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';

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
  type: z
    .enum(['file', 'directory'])
    .optional()
    .default('file')
    .describe(
      'Choose ONE: "file" (default) returns content inline; "directory" saves all files to disk and returns localPath. Directory mode requires ENABLE_LOCAL=true and ENABLE_CLONE=true, and is only available with the GitHub provider (not GitLab).'
    ),
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
    .max(2000)
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
  forceRefresh: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, bypass the cache and force a fresh fetch even if a valid ' +
        'cached copy exists. Only relevant for type "directory".'
    ),
});

export const FileContentQuerySchema = FileContentBaseSchema.superRefine(
  (data, ctx) => {
    // Directory type rejects all file-specific parameters
    if (data.type === 'directory') {
      if (data.fullContent === true) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Parameter "fullContent" is not supported when type is "directory". Directory mode saves all files to disk.',
          path: ['fullContent'],
        });
      }
      if (data.startLine !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Parameter "startLine" is not supported when type is "directory". Directory mode saves all files to disk.',
          path: ['startLine'],
        });
      }
      if (data.endLine !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Parameter "endLine" is not supported when type is "directory". Directory mode saves all files to disk.',
          path: ['endLine'],
        });
      }
      if (data.matchString !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Parameter "matchString" is not supported when type is "directory". Directory mode saves all files to disk.',
          path: ['matchString'],
        });
      }
      if (data.charOffset !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Parameter "charOffset" is not supported when type is "directory". Directory mode saves all files to disk.',
          path: ['charOffset'],
        });
      }
      if (data.charLength !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Parameter "charLength" is not supported when type is "directory". Directory mode saves all files to disk.',
          path: ['charLength'],
        });
      }
      return; // Skip file-specific validations
    }

    if (
      data.fullContent &&
      (data.startLine || data.endLine || data.matchString)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: GITHUB_FETCH_CONTENT.validation.parameterConflict,
        path: ['fullContent'],
      });
    }
    if (
      (data.startLine && !data.endLine) ||
      (!data.startLine && data.endLine)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: GITHUB_FETCH_CONTENT.validation.parameterConflict,
        path: ['startLine'],
      });
    }
  }
);

export const FileContentBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_FETCH_CONTENT,
  FileContentQuerySchema
);
