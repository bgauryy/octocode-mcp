import type { GitHubViewRepoStructureQuery } from '@octocodeai/octocode-core';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { GitHubViewRepoStructureBulkQuerySchema } from '@octocodeai/octocode-core';
import { exploreMultipleRepositoryStructures } from './execution.js';
import { GitHubViewRepoStructureOutputSchema } from '@octocodeai/octocode-core';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerViewGitHubRepoStructureTool =
  createRemoteToolRegistration<GitHubViewRepoStructureQuery>({
    name: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    title: 'GitHub Repository Structure Explorer',
    inputSchema: GitHubViewRepoStructureBulkQuerySchema,
    outputSchema: GitHubViewRepoStructureOutputSchema,
    executionFn: exploreMultipleRepositoryStructures,
  });
