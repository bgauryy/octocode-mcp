import { z } from 'zod';
import {
  BaseQuerySchema,
  createBulkQuerySchema,
} from '../../scheme/baseSchema.js';
import { GITHUB_SEARCH_PULL_REQUESTS, TOOL_NAMES } from '../toolMetadata.js';

const PRMatchScopeSchema = z
  .array(z.enum(['title', 'body', 'comments']))
  .optional()
  .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.match);

const DateRangeSchema = z.object({
  created: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.created),
  updated: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.updated),
});

const PR_VALIDATION_MESSAGES = {
  QUERY_TOO_LONG: 'Query too long. Maximum 256 characters allowed.',
  MISSING_PARAMS:
    'At least one valid search parameter, filter, or PR number is required.',
} as const;

const GitHubPullRequestSearchBaseSchema = BaseQuerySchema.extend({
  query: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.search.query),
  owner: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.scope.owner),
  repo: z.string().optional().describe(GITHUB_SEARCH_PULL_REQUESTS.scope.repo),
  prNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.scope.prNumber),
  state: z
    .enum(['open', 'closed'])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.state),
  assignee: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.assignee),
  author: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.author),
  commenter: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.commenter),
  involves: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.involves),
  mentions: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.mentions),
  'review-requested': z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['review-requested']),
  'reviewed-by': z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['reviewed-by']),
  label: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.label),
  'no-label': z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['no-label']),
  'no-milestone': z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['no-milestone']),
  'no-project': z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['no-project']),
  'no-assignee': z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['no-assignee']),
  head: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.head),
  base: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.base),
  created: DateRangeSchema.shape.created,
  updated: DateRangeSchema.shape.updated,
  closed: z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.closed),
  'merged-at': z
    .string()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters['merged-at']),
  comments: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.comments),
  reactions: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.reactions),
  interactions: z
    .union([
      z.number().int().min(0),
      z.string().regex(/^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/),
    ])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.interactions),
  merged: z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.merged),
  draft: z
    .boolean()
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.filters.draft),

  match: PRMatchScopeSchema,
  sort: z
    .enum(['created', 'updated', 'best-match'])
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.sorting.sort),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe(GITHUB_SEARCH_PULL_REQUESTS.sorting.order),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe(GITHUB_SEARCH_PULL_REQUESTS.resultLimit.limit),
  page: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(1)
    .describe(GITHUB_SEARCH_PULL_REQUESTS.pagination.page),
  withComments: z
    .boolean()
    .optional()
    .default(false)
    .describe(GITHUB_SEARCH_PULL_REQUESTS.outputShaping.withComments),
  withCommits: z
    .boolean()
    .optional()
    .default(false)
    .describe(GITHUB_SEARCH_PULL_REQUESTS.outputShaping.withCommits),
  type: z
    .enum(['metadata', 'fullContent', 'partialContent'])
    .optional()
    .default('metadata')
    .describe(GITHUB_SEARCH_PULL_REQUESTS.outputShaping.type),
  partialContentMetadata: z
    .array(
      z.object({
        file: z.string(),
        additions: z.array(z.number()).optional(),
        deletions: z.array(z.number()).optional(),
      })
    )
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.outputShaping.partialContentMetadata),

  charOffset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.outputLimit.charOffset),

  charLength: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe(GITHUB_SEARCH_PULL_REQUESTS.outputLimit.charLength),
});

export const GitHubPullRequestSearchQuerySchema =
  GitHubPullRequestSearchBaseSchema.superRefine((data, ctx) => {
    if (data.query && String(data.query).length > 256) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: PR_VALIDATION_MESSAGES.QUERY_TOO_LONG,
        path: ['query'],
      });
    }

    const hasValidParams =
      data.query?.trim() ||
      data.owner ||
      data.repo ||
      data.author ||
      data.assignee ||
      (data.prNumber && data.owner && data.repo);

    if (!hasValidParams) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: PR_VALIDATION_MESSAGES.MISSING_PARAMS,
        path: [],
      });
    }
  });

export const GitHubPullRequestSearchBulkQuerySchema = createBulkQuerySchema(
  TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
  GitHubPullRequestSearchQuerySchema
);
