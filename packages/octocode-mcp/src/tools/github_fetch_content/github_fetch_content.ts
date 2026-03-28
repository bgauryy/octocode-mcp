import type { FileContentQuery } from './types.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import { FileContentBulkQuerySchema } from './scheme.js';
import { fetchMultipleGitHubFileContents } from './execution.js';
import { GitHubFetchContentOutputSchema } from '../../scheme/outputSchemas.js';
import { createRemoteToolRegistration } from '../registerRemoteTool.js';

export const registerFetchGitHubFileContentTool =
  createRemoteToolRegistration<FileContentQuery>({
    name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
    title: 'GitHub File Content Fetch',
    inputSchema: FileContentBulkQuerySchema,
    outputSchema: GitHubFetchContentOutputSchema,
    executionFn: fetchMultipleGitHubFileContents,
    annotations: { readOnlyHint: false },
  });
