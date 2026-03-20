import { filterPatch } from '../utils/parsers/diff.js';
import type { PullRequestQuery } from './providerQueries.js';

interface NormalizedPullRequestFileChange {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface PullRequestFileChangeSummary {
  changedFilesCount?: number;
  additions?: number;
  deletions?: number;
  fileChanges?: NormalizedPullRequestFileChange[];
}

function getRequestedContentType(
  query: PullRequestQuery
): 'metadata' | 'fullContent' | 'partialContent' {
  return query.type ?? 'metadata';
}

function filterPartialContent(
  fileChanges: NormalizedPullRequestFileChange[],
  query: PullRequestQuery
): NormalizedPullRequestFileChange[] {
  const metadataMap = new Map(
    query.partialContentMetadata?.map(metadata => [metadata.file, metadata]) ??
      []
  );

  return fileChanges
    .filter(fileChange => metadataMap.has(fileChange.path))
    .map(fileChange => {
      const metadata = metadataMap.get(fileChange.path);
      const filteredPatch = fileChange.patch
        ? filterPatch(
            fileChange.patch,
            metadata?.additions,
            metadata?.deletions
          )
        : undefined;

      return {
        ...fileChange,
        patch: filteredPatch || undefined,
      };
    });
}

export function countPatchLineChanges(patch?: string): {
  additions: number;
  deletions: number;
} {
  if (!patch) {
    return { additions: 0, deletions: 0 };
  }

  let additions = 0;
  let deletions = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }
    if (line.startsWith('+')) {
      additions++;
      continue;
    }
    if (line.startsWith('-')) {
      deletions++;
    }
  }

  return { additions, deletions };
}

export function shapePullRequestFileChanges(
  fileChanges: NormalizedPullRequestFileChange[],
  query: PullRequestQuery
): PullRequestFileChangeSummary {
  if (fileChanges.length === 0) {
    return {};
  }

  const contentType = getRequestedContentType(query);

  const visibleFileChanges =
    contentType === 'partialContent'
      ? filterPartialContent(fileChanges, query)
      : contentType === 'metadata'
        ? fileChanges.map(fileChange => ({
            ...fileChange,
            patch: undefined,
          }))
        : fileChanges;

  return {
    changedFilesCount: fileChanges.length,
    additions: visibleFileChanges.reduce(
      (sum, fileChange) => sum + fileChange.additions,
      0
    ),
    deletions: visibleFileChanges.reduce(
      (sum, fileChange) => sum + fileChange.deletions,
      0
    ),
    ...(visibleFileChanges.length > 0
      ? { fileChanges: visibleFileChanges }
      : {}),
  };
}

export function parseUnifiedDiffByFile(diff?: string): Map<string, string> {
  const patches = new Map<string, string>();

  if (!diff) {
    return patches;
  }

  const lines = diff.split('\n');
  let currentPaths: string[] = [];
  let currentPatch: string[] = [];

  const flushPatch = () => {
    if (currentPaths.length === 0 || currentPatch.length === 0) {
      return;
    }

    const patchText = currentPatch.join('\n');
    for (const path of currentPaths) {
      patches.set(path, patchText);
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flushPatch();

      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      currentPaths = match ? Array.from(new Set([match[1]!, match[2]!])) : [];
      currentPatch = [line];
      continue;
    }

    if (currentPatch.length > 0) {
      currentPatch.push(line);
    }
  }

  flushPatch();
  return patches;
}
