import type {
  FileContentQuery,
  FileContentResult,
  ProviderResponse,
} from '../types.js';
import {
  fetchBitbucketFileContentAPI,
  getBitbucketDefaultBranch,
} from '../../bitbucket/fileContent.js';
import type { BitbucketFileContentResult } from '../../bitbucket/types.js';
import {
  handleBitbucketAPIResponse,
  parseBitbucketProjectId,
} from './utils.js';

export function transformFileContentResult(
  data: BitbucketFileContentResult,
  query: FileContentQuery
): FileContentResult {
  let content = data.content;

  if (query.startLine || query.endLine) {
    const lines = content.split('\n');
    const start = (query.startLine || 1) - 1;
    const end = query.endLine || lines.length;
    content = lines.slice(start, end).join('\n');
  }

  return {
    path: data.path || query.path,
    content,
    encoding: 'utf-8',
    size: data.size || 0,
    ref: data.ref || query.ref || '',
    lastCommitSha: data.lastCommitSha,
    pagination: undefined,
    isPartial: query.startLine !== undefined || query.endLine !== undefined,
    startLine: query.startLine,
    endLine: query.endLine,
  };
}

export async function getFileContent(
  query: FileContentQuery
): Promise<ProviderResponse<FileContentResult>> {
  const { workspace, repoSlug } = parseBitbucketProjectId(query.projectId);

  let ref = query.ref;
  if (!ref) {
    ref = await getBitbucketDefaultBranch(workspace, repoSlug);
  }

  const result = await fetchBitbucketFileContentAPI({
    workspace,
    repoSlug,
    path: query.path,
    ref,
  });

  return handleBitbucketAPIResponse(result, data =>
    transformFileContentResult(data, query)
  );
}
