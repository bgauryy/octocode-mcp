import { z } from 'zod';
import { GitHubReposSearchSingleQuerySchema as CoreGitHubReposSearchSingleQuerySchema } from '../../toolContract/input/resources/tools/githubRepositoriesOperation.js';
import { GITHUB_SEARCH_MAX_LIMIT } from '../../config.js';
import {
  clampedInt,
  createRelaxedBulkQuerySchema,
  relaxedPageNumberField,
} from '../../scheme/fields.js';
import {
  createQueryShapeSchema,
  describeQuerySchema,
} from '../../scheme/coreSchemas.js';
const queryOverrides = {
  limit: clampedInt(1, GITHUB_SEARCH_MAX_LIMIT).optional(),
  page: relaxedPageNumberField.default(1),
  // `match` here selects WHICH text fields to search — a different concept
  // from code-operation `match`, which selects WHERE the search looks (file
  // contents vs paths). Don't carry intuition across tools.
  match: z.array(z.enum(['name', 'description', 'readme'])).optional(),
} as const;

export const GitHubReposSearchSingleQueryLocalSchema = describeQuerySchema(
  CoreGitHubReposSearchSingleQuerySchema,
  queryOverrides
);

export const GitHubReposSearchBulkQueryLocalSchema =
  createRelaxedBulkQuerySchema(
    createQueryShapeSchema(
      CoreGitHubReposSearchSingleQuerySchema,
      queryOverrides
    )
  );
