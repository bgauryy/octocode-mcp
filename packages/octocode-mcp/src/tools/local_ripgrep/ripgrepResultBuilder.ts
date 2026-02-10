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
import { byteToCharIndex, byteSlice } from '../../utils/file/byteOffset.js';

/**
 * Build the final search result with pagination and metadata
 */
export async function buildSearchResult(
  parsedFiles: RipgrepFileMatches[],
  configuredQuery: RipgrepQuery,
  searchEngine: 'rg' | 'grep',
  warnings: string[],
  stats?: SearchStats
): Promise<SearchContentResult> {
  const filesWithCharOffsets =
    searchEngine === 'rg'
      ? await computeCharacterOffsets(parsedFiles)
      : parsedFiles; // grep doesn't provide byte offsets

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
  // When filesOnly=true with ripgrep, use stats.matchCount from summary if available
  // (ripgrep's -l flag doesn't return individual match data, but summary has totals)
  // For grep or when stats unavailable, fall back to summing individual matchCounts
  // For filesOnly mode without stats, use totalFiles as fallback (each file = 1 match)
  const summedMatches = limitedFiles.reduce(
    (sum: number, f: RipgrepFileMatches & { modified?: string }) =>
      sum + f.matchCount,
    0
  );
  const totalMatches = configuredQuery.filesOnly
    ? (stats?.matchCount ?? totalFiles) // filesOnly: use stats or fallback to file count
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
      const paginatedMatches = configuredQuery.filesOnly
        ? []
        : file.matches.slice(0, matchesPerPage);

      const result: RipgrepFileMatches = {
        path: file.path,
        matchCount: totalFileMatches,
        matches: paginatedMatches,
        pagination:
          !configuredQuery.filesOnly && totalFileMatches > matchesPerPage
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
    cwd: process.cwd(),
    totalMatches,
    totalFiles,
    path: configuredQuery.path,
    searchEngine,
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

  if (totalMatches > 0 && totalMatches <= 100)
    hints.push('', 'Good result size - manageable for analysis');

  if (totalMatches > 0) {
    const contentLength =
      query.matchContentLength || RESOURCE_LIMITS.DEFAULT_MATCH_CONTENT_LENGTH;
    hints.push(
      '',
      'Integration:',
      '  - location.byteOffset/byteLength: raw byte offsets from ripgrep (use with Buffer operations)',
      '  - location.charOffset/charLength: character indices for JavaScript strings',
      `  - Match values truncated to ${contentLength} chars (configurable via matchContentLength: 1-800)`,
      '  - Line/column numbers provided for human reference'
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

/**
 * Compute actual character offsets for matches by reading file content.
 * This converts ripgrep's byte offsets to JavaScript string indices.
 */
export async function computeCharacterOffsets(
  files: RipgrepFileMatches[]
): Promise<RipgrepFileMatches[]> {
  return Promise.all(
    files.map(async file => {
      if (!file.matches || file.matches.length === 0) {
        return file;
      }

      try {
        // Read file content for byte-to-char conversion
        const content = await fs.readFile(file.path, 'utf8');

        // Update each match with actual character positions
        const updatedMatches = file.matches.map(match => {
          const charOffset = byteToCharIndex(
            content,
            match.location.byteOffset
          );
          const matchText = byteSlice(
            content,
            match.location.byteOffset,
            match.location.byteOffset + match.location.byteLength
          );

          return {
            ...match,
            location: {
              ...match.location,
              charOffset,
              charLength: matchText.length,
            },
          };
        });

        return {
          ...file,
          matches: updatedMatches,
        };
      } catch {
        // If file read fails, keep byte offsets as fallback
        return file;
      }
    })
  );
}
