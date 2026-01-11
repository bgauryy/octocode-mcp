import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { GITHUB_SEARCH_CODE, TOOL_NAMES } from '../toolMetadata.js';

export const GitHubCodeSearchQuerySchema = BaseQuerySchema.extend({
  keywordsToSearch: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe(GITHUB_SEARCH_CODE.search.keywordsToSearch),
  owner: z.string().optional().describe(GITHUB_SEARCH_CODE.scope.owner),
  repo: z.string().optional().describe(GITHUB_SEARCH_CODE.scope.repo),
  extension: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_CODE.filters.extension),
  filename: z.string().optional().describe(GITHUB_SEARCH_CODE.filters.filename),
  path: z.string().optional().describe(GITHUB_SEARCH_CODE.filters.path),
  match: z
    .enum(['file', 'path'])
    .optional()
    .describe(GITHUB_SEARCH_CODE.filters.match),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .optional()
    .describe(GITHUB_SEARCH_CODE.resultLimit.limit),
  page: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(1)
    .optional()
    .describe(GITHUB_SEARCH_CODE.pagination.page),
});

export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_SEARCH_CODE,
  GitHubCodeSearchQuerySchema
);
