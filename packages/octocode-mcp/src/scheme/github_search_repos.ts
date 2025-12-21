import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_SEARCH_REPOS, TOOL_NAMES } from '../tools/toolMetadata';

const GitHubReposSearchSingleQuerySchema = BaseQuerySchema.extend({
  keywordsToSearch: z
    .array(z.string())
    .optional()
    .describe(GITHUB_SEARCH_REPOS.search.keywordsToSearch),
  topicsToSearch: z
    .array(z.string())
    .optional()
    .describe(GITHUB_SEARCH_REPOS.search.topicsToSearch),
  owner: z.string().optional().describe(GITHUB_SEARCH_REPOS.scope.owner),
  stars: z.string().optional().describe(GITHUB_SEARCH_REPOS.filters.stars),
  size: z.string().optional().describe(GITHUB_SEARCH_REPOS.filters.size),
  created: z.string().optional().describe(GITHUB_SEARCH_REPOS.filters.created),
  updated: z.string().optional().describe(GITHUB_SEARCH_REPOS.filters.updated),
  match: z
    .array(z.enum(['name', 'description', 'readme']))
    .optional()
    .describe(GITHUB_SEARCH_REPOS.filters.match),
  sort: z
    .enum(['forks', 'stars', 'updated', 'best-match'])
    .optional()
    .describe(GITHUB_SEARCH_REPOS.sorting.sort),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(10)
    .optional()
    .describe(GITHUB_SEARCH_REPOS.resultLimit.limit),
}).refine(
  data =>
    (data.keywordsToSearch && data.keywordsToSearch.length > 0) ||
    (data.topicsToSearch && data.topicsToSearch.length > 0),
  {
    message:
      "At least one of 'keywordsToSearch' or 'topicsToSearch' is required",
    path: ['keywordsToSearch'],
  }
);

export const GitHubReposSearchQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
  GitHubReposSearchSingleQuerySchema
);
