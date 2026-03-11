import type {
  DirectoryEntry,
  ProviderResponse,
  RepoStructureQuery,
  RepoStructureResult,
} from '../types.js';
import { viewBitbucketRepoStructureAPI } from '../../bitbucket/repoStructure.js';
import type { BitbucketTreeEntry } from '../../bitbucket/types.js';
import {
  handleBitbucketAPIResponse,
  parseBitbucketProjectId,
} from './utils.js';

function buildStructureFromEntries(
  entries: BitbucketTreeEntry[],
  basePath: string
): Record<string, DirectoryEntry> {
  const structure: Record<string, DirectoryEntry> = {};
  const normalizedBase = basePath === '' || basePath === '/' ? '' : basePath;

  const getRelativeParent = (itemPath: string): string => {
    let relativePath = itemPath;
    if (normalizedBase && itemPath.startsWith(normalizedBase)) {
      relativePath = itemPath.slice(normalizedBase.length);
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1);
      }
    }
    const lastSlash = relativePath.lastIndexOf('/');
    return lastSlash === -1 ? '.' : relativePath.slice(0, lastSlash);
  };

  const getItemName = (itemPath: string): string => {
    const lastSlash = itemPath.lastIndexOf('/');
    return lastSlash === -1 ? itemPath : itemPath.slice(lastSlash + 1);
  };

  for (const entry of entries) {
    const parentDir = getRelativeParent(entry.path);
    if (!structure[parentDir]) {
      structure[parentDir] = { files: [], folders: [] };
    }
    const itemName = getItemName(entry.path);
    if (entry.type === 'commit_file') {
      structure[parentDir].files.push(itemName);
    } else {
      structure[parentDir].folders.push(itemName);
    }
  }

  return structure;
}

export async function getRepoStructure(
  query: RepoStructureQuery
): Promise<ProviderResponse<RepoStructureResult>> {
  const { workspace, repoSlug } = parseBitbucketProjectId(query.projectId);

  const result = await viewBitbucketRepoStructureAPI({
    workspace,
    repoSlug,
    ref: query.ref,
    path: query.path,
    depth: query.depth,
    entriesPerPage: query.entriesPerPage,
    entryPageNumber: query.entryPageNumber,
  });

  return handleBitbucketAPIResponse(result, data => {
    const structure = buildStructureFromEntries(data.entries, data.path);
    const totalFiles = data.entries.filter(
      e => e.type === 'commit_file'
    ).length;
    const totalFolders = data.entries.filter(
      e => e.type === 'commit_directory'
    ).length;

    return {
      projectPath: `${workspace}/${repoSlug}`,
      branch: data.branch,
      path: data.path || '',
      structure,
      summary: {
        totalFiles,
        totalFolders,
        truncated: data.pagination.hasMore,
      },
      pagination: data.pagination,
    };
  });
}
