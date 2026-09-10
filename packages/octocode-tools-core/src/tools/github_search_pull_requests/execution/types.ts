import type { z } from 'zod';
import { GitHubPullRequestSearchQueryLocalSchema } from '@octocodeai/octocode-core/schema';
import type { WithOptionalMeta } from '../../../types/execution.js';

export type GitHubPullRequestSearchQuery = z.infer<
  typeof GitHubPullRequestSearchQueryLocalSchema
>;

export type GitHubPullRequestSearchInput = z.input<
  typeof GitHubPullRequestSearchQueryLocalSchema
>;

export type PartialPRQuery = WithOptionalMeta<GitHubPullRequestSearchQuery>;
