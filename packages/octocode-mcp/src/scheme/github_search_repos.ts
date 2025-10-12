import { z } from 'zod';
import { BaseQuerySchema, createBulkQuerySchema } from './baseSchema';
import { GITHUB_SEARCH_REPOS } from './schemDescriptions';
import { TOOL_NAMES } from '../constants';

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
    .max(20)
    .optional()
    .describe(GITHUB_SEARCH_REPOS.resultLimit.limit),
});

export const GitHubReposSearchQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
  GitHubReposSearchSingleQuerySchema
);
