import type { GitHubViewRepoStructureQuery } from './types.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { GitHubViewRepoStructureBulkQuerySchema } from './scheme.js';
import { exploreMultipleRepositoryStructures } from './execution.js';
import { GitHubViewRepoStructureOutputSchema } from '../../scheme/outputSchemas.js';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerViewGitHubRepoStructureTool =
  createRemoteToolRegistration<GitHubViewRepoStructureQuery>({
    name: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    title: 'GitHub Repository Structure Explorer',
    inputSchema: GitHubViewRepoStructureBulkQuerySchema,
    outputSchema: GitHubViewRepoStructureOutputSchema,
    executionFn: exploreMultipleRepositoryStructures,
  });
