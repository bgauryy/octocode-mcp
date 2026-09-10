import type { AstFilesEntry } from '@octocodeai/octocode-core/types';
import type { ToolContinuation } from '../../../scheme/pagination.js';

export type FilesNextMap = {
  fetch?: ToolContinuation;
  viewStructure?: ToolContinuation;
};

/** Keep absolute paths in executable hints; pagination is added by the operation. */
export function buildFilesNextMap(
  files: readonly AstFilesEntry[]
): FilesNextMap | undefined {
  const firstFile = files.find(entry => entry.type === 'file');
  if (firstFile) {
    return {
      fetch: {
        tool: 'localFetch',
        query: { path: firstFile.path, minify: 'none' },
        why: 'Read exact source from the first file; choose minify:"symbols" when orientation is needed before selecting a section or declaration.',
        confidence: 'exact',
      },
    };
  }

  const firstDir = files.find(entry => entry.type === 'directory');
  if (firstDir) {
    return {
      viewStructure: {
        tool: 'astSearch',
        query: {
          operation: 'tree',
          treeKind: 'filesystem',
          path: firstDir.path,
        },
        why: 'Orient inside the first matched directory before reading files.',
        confidence: 'exact',
      },
    };
  }

  return undefined;
}
