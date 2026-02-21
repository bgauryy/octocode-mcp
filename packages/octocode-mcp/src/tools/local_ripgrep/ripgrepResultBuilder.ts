import { getHints } from '../../hints/index.js';
import type { RipgrepQuery } from './scheme.js';
import type {
  SearchContentResult,
  SearchStats,
  RipgrepFileMatches,
} from '../../utils/core/types.js';
import { RESOURCE_LIMITS } from '../../utils/core/constants.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import { promises as fs } from 'fs';

/**
 * Build the final search result with pagination and metadata
 */
export async function buildSearchResult(
  parsedFiles: RipgrepFileMatches[],
  configuredQuery: RipgrepQuery,
  _searchEngine: 'rg' | 'grep',
  warnings: string[],
  stats?: SearchStats
): Promise<SearchContentResult> {
  const filesWithCharOffsets = parsedFiles;

  const filesWithMetadata = await Promise.all(
    filesWithCharOffsets.map(async f => {
      const file: typeof f & { modified?: string } = { ...f };
      if (configuredQuery.showFileLastModified) {
        file.modified = await getFileModifiedTime(f.path);
      }
      return file;
    })
  );

  filesWithMetadata.sort(
    (
      a: RipgrepFileMatches & { modified?: string },
      b: RipgrepFileMatches & { modified?: string }
    ) => {
      if (configuredQuery.showFileLastModified && a.modified && b.modified) {
        return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      }
      return a.path.localeCompare(b.path);
    }
  );

  let limitedFiles = filesWithMetadata;
  let wasLimited = false;
  if (
    configuredQuery.maxFiles &&
    filesWithMetadata.length > configuredQuery.maxFiles
  ) {
    limitedFiles = filesWithMetadata.slice(0, configuredQuery.maxFiles);
    wasLimited = true;
  }

  const totalFiles = limitedFiles.length;
  const isFileListMode =
    configuredQuery.filesOnly ||
    configuredQuery.count ||
    configuredQuery.countMatches;
  // When in file-list mode (filesOnly, count, countMatches), use stats.matchCount if available.
  // For count/countMatches modes, stats.matchCount is computed from parsed per-file counts.
  // For filesOnly mode (-l), stats are unavailable so fall back to summing individual matchCounts.
  const summedMatches = limitedFiles.reduce(
    (sum: number, f: RipgrepFileMatches & { modified?: string }) =>
      sum + f.matchCount,
    0
  );
  const totalMatches = isFileListMode
    ? (stats?.matchCount ?? summedMatches)
    : summedMatches;

  const filesPerPage =
    configuredQuery.filesPerPage || RESOURCE_LIMITS.DEFAULT_FILES_PER_PAGE;
  const filePageNumber = configuredQuery.filePageNumber || 1;
  const totalFilePages = Math.ceil(totalFiles / filesPerPage);
  const startIdx = (filePageNumber - 1) * filesPerPage;
  const endIdx = Math.min(startIdx + filesPerPage, totalFiles);
  const paginatedFiles = limitedFiles.slice(startIdx, endIdx);

  const matchesPerPage =
    configuredQuery.matchesPerPage || RESOURCE_LIMITS.DEFAULT_MATCHES_PER_PAGE;

  const finalFiles: RipgrepFileMatches[] = paginatedFiles.map(
    (file: RipgrepFileMatches & { modified?: string }) => {
      const totalFileMatches = file.matches.length;
      const totalMatchPages = Math.ceil(totalFileMatches / matchesPerPage);
      const paginatedMatches = isFileListMode
        ? []
        : file.matches.slice(0, matchesPerPage);

      const result: RipgrepFileMatches = {
        path: file.path,
        matchCount: isFileListMode ? file.matchCount || 1 : totalFileMatches,
        matches: paginatedMatches,
        pagination:
          !isFileListMode && totalFileMatches > matchesPerPage
            ? {
                currentPage: 1,
                totalPages: totalMatchPages,
                matchesPerPage,
                totalMatches: totalFileMatches,
                hasMore: totalMatchPages > 1,
              }
            : undefined,
      };
      if (configuredQuery.showFileLastModified && file.modified) {
        result.modified = file.modified;
      }
      return result;
    }
  );

  const paginationHints = [
    `File page ${filePageNumber}/${totalFilePages} (showing ${finalFiles.length} of ${totalFiles})`,
    `Total: ${totalMatches} matches across ${totalFiles} files`,
    filePageNumber < totalFilePages
      ? `Next: filePageNumber=${filePageNumber + 1}`
      : 'Final page',
  ];

  if (wasLimited) {
    paginationHints.push(
      `Results limited to ${configuredQuery.maxFiles} files (found ${filesWithMetadata.length} matching)`
    );
  }

  const filesWithMoreMatches = finalFiles.filter(f => f.pagination?.hasMore);
  if (filesWithMoreMatches.length > 0) {
    paginationHints.push(
      `Note: ${filesWithMoreMatches.length} file(s) have more matches - use matchesPerPage to see more`
    );
  }

  const refinementHints = _getStructuredResultSizeHints(
    finalFiles,
    configuredQuery,
    totalMatches
  );

  return {
    status: 'hasResults',
    files: finalFiles,
    path: configuredQuery.path,
    pagination: {
      currentPage: filePageNumber,
      totalPages: totalFilePages,
      filesPerPage,
      totalFiles,
      hasMore: filePageNumber < totalFilePages,
    },
    warnings,
    researchGoal: configuredQuery.researchGoal,
    reasoning: configuredQuery.reasoning,
    hints: [
      ...paginationHints,
      ...refinementHints,
      ...getHints(TOOL_NAMES.LOCAL_RIPGREP, 'hasResults'),
      'files[].matches[].line = use as lineHint for LSP tools',
    ],
  };
}

function _getStructuredResultSizeHints(
  files: RipgrepFileMatches[],
  query: RipgrepQuery,
  totalMatches: number
): string[] {
  const hints: string[] = [];

  if (totalMatches > 100 || files.length > 20) {
    hints.push('', 'Large result set - refine search:');
    if (!query.type && !query.include)
      hints.push(
        '  - Narrow by file type: type="ts" or include=["*.{ts,tsx}"]'
      );
    if (!query.excludeDir?.length)
      hints.push(
        '  - Exclude directories: excludeDir=["test", "vendor", "generated"]'
      );
    if (query.pattern.length < 5)
      hints.push(
        '  - Use more specific pattern (current pattern is very short)'
      );
  }

  return hints;
}

export async function getFileModifiedTime(
  filePath: string
): Promise<string | undefined> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.toISOString();
  } catch {
    return undefined;
  }
}
