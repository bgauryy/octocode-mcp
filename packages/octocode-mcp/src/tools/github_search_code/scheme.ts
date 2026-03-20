import { z } from 'zod/v4';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { GITHUB_SEARCH_CODE } from '../toolMetadata/githubSchemaHelpers.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';

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
    .optional()
    .default(10)
    .describe(GITHUB_SEARCH_CODE.resultLimit.limit),
  page: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(1)
    .describe(GITHUB_SEARCH_CODE.pagination.page),
  charOffset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Character offset for output pagination after domain pagination has been applied.'
    ),
  charLength: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe(
      'Character budget for output pagination after domain pagination has been applied.'
    ),
});

export const GitHubCodeSearchBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_SEARCH_CODE,
  GitHubCodeSearchQuerySchema
);
