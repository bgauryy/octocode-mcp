import type { DirectoryEntry } from './filters.js';
import type { ToolContinuation } from '../../../scheme/pagination.js';

export type TreeNextMap = {
  fetch?: ToolContinuation;
  viewDeeper?: ToolContinuation;
};

/** Keep absolute paths in executable hints; pagination is added by the operation. */
export function buildTreeNextMap(
  entries: readonly DirectoryEntry[]
): TreeNextMap | undefined {
  const next: TreeNextMap = {};

  const firstFile = entries.find(entry => entry.type === 'file' && entry.path);
  if (firstFile?.path) {
    next.fetch = {
      tool: 'localFetch',
      query: { path: firstFile.path, minify: 'standard' },
      why: 'Read the first listed file (minify:"symbols" for a skeleton, minify:"none" for exact bytes).',
      confidence: 'exact',
    };
  }

  const firstDir = entries.find(
    entry => entry.type === 'directory' && entry.path
  );
  if (firstDir?.path) {
    next.viewDeeper = {
      tool: 'astSearch',
      query: { operation: 'tree', treeKind: 'filesystem', path: firstDir.path },
      why: 'Descend into the first listed subdirectory.',
      confidence: 'exact',
    };
  }

  return next.fetch || next.viewDeeper ? next : undefined;
}
