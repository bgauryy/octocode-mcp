import { RipgrepCommandBuilder } from '../commands/RipgrepCommandBuilder.js';
import { safeExec } from '../utils/local/utils/exec.js';
import { getToolHints, getLargeFileWorkflowHints } from './hints.js';
import {
  validateRipgrepQuery,
  applyWorkflowMode,
  type RipgrepQuery,
} from '../scheme/local_ripgrep.js';
import {
  validateToolPath,
  createErrorResult,
} from '../utils/local/utils/toolHelpers.js';
import { RESOURCE_LIMITS } from '../utils/constants.js';
import type {
  SearchContentResult,
  SearchStats,
  RipgrepFileMatches,
  RipgrepMatch,
} from '../utils/types.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ERROR_CODES } from '../errorCodes.js';

export async function searchContentRipgrep(
  query: RipgrepQuery
): Promise<SearchContentResult> {
  const configuredQuery = applyWorkflowMode(query);

  try {
    const validation = validateRipgrepQuery(configuredQuery);
    if (!validation.isValid) {
      return createErrorResult(
        new Error(`Query validation failed: ${validation.errors.join(', ')}`),
        'LOCAL_RIPGREP',
        configuredQuery,
        { warnings: validation.warnings }
      ) as SearchContentResult;
    }

    const pathValidation = validateToolPath(configuredQuery, 'LOCAL_RIPGREP');
    if (!pathValidation.isValid) {
      return {
        ...pathValidation.errorResult,
        warnings: validation.warnings,
      } as SearchContentResult;
    }

    const dirStats = await estimateDirectoryStats(configuredQuery.path);
    const chunkingWarnings: string[] = [];

    if (dirStats.isLarge && !configuredQuery.filesOnly) {
      chunkingWarnings.push(
        `Large directory detected (~${Math.round(dirStats.estimatedSizeMB)}MB, ~${dirStats.estimatedFileCount} files). Consider chunking workflow for better performance.`
      );
      chunkingWarnings.push(...getLargeFileWorkflowHints('search'));
    }

    const builder = new RipgrepCommandBuilder();
    const { command, args } = builder.fromQuery(configuredQuery).build();

    const result = await safeExec(command, args);

    if (!result.success || !result.stdout.trim()) {
      return {
        status: 'empty',
        path: configuredQuery.path,
        searchEngine: 'rg',
        warnings: [...validation.warnings, ...chunkingWarnings],
        researchGoal: configuredQuery.researchGoal,
        reasoning: configuredQuery.reasoning,
        hints: getToolHints('LOCAL_RIPGREP', 'empty'),
      };
    }

    const { files: parsedFiles } = parseRipgrepJson(
      result.stdout,
      configuredQuery
    );

    const filesWithMetadata = await Promise.all(
      parsedFiles.map(async f => {
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
          return (
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
          );
        }
        // Fallback to path sorting when modified is not available
        return a.path.localeCompare(b.path);
      }
    );

    // Apply maxFiles limit if specified
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
    const totalMatches = limitedFiles.reduce(
      (sum: number, f: RipgrepFileMatches & { modified?: string }) =>
        sum + f.matchCount,
      0
    );

    const filesPerPage =
      configuredQuery.filesPerPage || RESOURCE_LIMITS.DEFAULT_FILES_PER_PAGE;
    const filePageNumber = configuredQuery.filePageNumber || 1;
    const totalFilePages = Math.ceil(totalFiles / filesPerPage);
    const startIdx = (filePageNumber - 1) * filesPerPage;
    const endIdx = Math.min(startIdx + filesPerPage, totalFiles);
    const paginatedFiles = limitedFiles.slice(startIdx, endIdx);

    const matchesPerPage =
      configuredQuery.matchesPerPage ||
      RESOURCE_LIMITS.DEFAULT_MATCHES_PER_PAGE;

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

    // Add hint if files were limited
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
      totalMatches: configuredQuery.filesOnly ? 0 : totalMatches,
      totalFiles,
      path: configuredQuery.path,
      searchEngine: 'rg',
      pagination: {
        currentPage: filePageNumber,
        totalPages: totalFilePages,
        filesPerPage,
        totalFiles,
        hasMore: filePageNumber < totalFilePages,
      },
      warnings: [...validation.warnings, ...chunkingWarnings],
      researchGoal: configuredQuery.researchGoal,
      reasoning: configuredQuery.reasoning,
      hints: [
        ...paginationHints,
        ...refinementHints,
        ...getToolHints('LOCAL_RIPGREP', 'hasResults'),
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Provide helpful hints for output size limit errors
    if (errorMessage.includes('Output size limit exceeded')) {
      return {
        status: 'error',
        errorCode: ERROR_CODES.OUTPUT_TOO_LARGE,
        path: configuredQuery.path,
        searchEngine: 'rg',
        researchGoal: configuredQuery.researchGoal,
        reasoning: configuredQuery.reasoning,
        hints: [
          'Output exceeded 10MB - your pattern matched too broadly. Think about why results exploded:',
          'Is the pattern too generic? Make it specific to target what you actually need',
          'Searching everything? Add type filters or path restrictions to focus scope',
          'For node_modules: Target specific packages rather than searching the entire directory',
          'Need file names only? FIND_FILES searches metadata without reading content',
          'Strategy: Start with filesOnly=true to see what matched, then narrow before reading content',
        ],
      } as SearchContentResult;
    }

    return createErrorResult(
      error,
      'LOCAL_RIPGREP',
      configuredQuery
    ) as SearchContentResult;
  }
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
      '  - Use location.charOffset with FETCH_CONTENT for precise extraction',
      '  - WARNING: charOffset/charLength are BYTE offsets, not character offsets (matters for UTF-8 multi-byte chars)',
      `  - Match values truncated to ${contentLength} chars (configurable via matchContentLength: 1-800)`,
      '  - Line/column numbers provided for human reference'
    );
  }

  return hints;
}

async function estimateDirectoryStats(dirPath: string): Promise<{
  estimatedSizeMB: number;
  estimatedFileCount: number;
  isLarge: boolean;
}> {
  try {
    let fileCount = 0;
    let totalSize = 0;

    const rootEntries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of rootEntries) {
      if (entry.isFile()) {
        try {
          const stats = await fs.stat(join(dirPath, entry.name));
          totalSize += stats.size;
          fileCount++;
        } catch {
          // Skip inaccessible files
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        try {
          const subEntries = await fs.readdir(join(dirPath, entry.name), {
            withFileTypes: true,
          });
          const subFiles = subEntries.filter(e => e.isFile());
          fileCount += subFiles.length;
          totalSize +=
            subFiles.length * RESOURCE_LIMITS.ESTIMATED_AVG_FILE_SIZE_BYTES;
        } catch {
          // Skip inaccessible directories
        }
      }
    }

    const estimatedSizeMB = totalSize / (1024 * 1024);
    const isLarge =
      estimatedSizeMB > RESOURCE_LIMITS.MAX_RIPGREP_DIRECTORY_SIZE_MB ||
      fileCount > RESOURCE_LIMITS.MAX_FILE_COUNT_FOR_SEARCH;

    return {
      estimatedSizeMB,
      estimatedFileCount: fileCount,
      isLarge,
    };
  } catch {
    return {
      estimatedSizeMB: 0,
      estimatedFileCount: 0,
      isLarge: false,
    };
  }
}

interface RipgrepJsonMatch {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

interface RipgrepJsonContext {
  type: 'context';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
  };
}

interface RipgrepJsonBegin {
  type: 'begin';
  data: {
    path: { text: string };
  };
}

interface RipgrepJsonEnd {
  type: 'end';
  data: {
    path: { text: string };
    stats?: {
      elapsed: { human: string };
      searches: number;
      searches_with_match: number;
    };
  };
}

interface RipgrepJsonSummary {
  type: 'summary';
  data: {
    elapsed_total: { human: string };
    stats: {
      elapsed: { human: string };
      searches: number;
      searches_with_match: number;
      bytes_searched: number;
      bytes_printed: number;
      matched_lines: number;
      matches: number;
    };
  };
}

type RipgrepJsonMessage =
  | RipgrepJsonMatch
  | RipgrepJsonContext
  | RipgrepJsonBegin
  | RipgrepJsonEnd
  | RipgrepJsonSummary;

function parseRipgrepJson(
  jsonOutput: string,
  query: RipgrepQuery
): {
  files: RipgrepFileMatches[];
  stats: SearchStats;
} {
  const lines = jsonOutput.trim().split('\n').filter(Boolean);
  type RawMatch = {
    lineText: string;
    lineNumber: number;
    absoluteOffset: number;
    column: number;
    matchLength: number;
  };

  const fileMap = new Map<
    string,
    {
      rawMatches: RawMatch[];
      contexts: Map<number, string>;
    }
  >();

  let stats: SearchStats = {};

  for (const line of lines) {
    if (!line.trim()) continue;

    if (!line.trim().startsWith('{')) {
      continue;
    }

    try {
      const msg: RipgrepJsonMessage = JSON.parse(line);

      if (msg.type === 'match') {
        const path = msg.data.path.text;
        const lineText = msg.data.lines.text;
        const lineNumber = msg.data.line_number;
        const absoluteOffset = msg.data.absolute_offset;

        if (!fileMap.has(path)) {
          fileMap.set(path, { rawMatches: [], contexts: new Map() });
        }
        const firstSubmatch = msg.data.submatches[0];
        const column = firstSubmatch?.start ?? 0;
        const matchLength = firstSubmatch
          ? firstSubmatch.end - firstSubmatch.start
          : lineText.length;

        fileMap.get(path)!.rawMatches.push({
          lineText,
          lineNumber,
          absoluteOffset,
          column,
          matchLength,
        });
      } else if (msg.type === 'context') {
        const path = msg.data.path.text;
        const lineNumber = msg.data.line_number;
        const lineText = msg.data.lines.text;

        if (!fileMap.has(path)) {
          fileMap.set(path, { rawMatches: [], contexts: new Map() });
        }
        fileMap.get(path)!.contexts.set(lineNumber, lineText);
      } else if (msg.type === 'summary') {
        stats = {
          matchCount: msg.data.stats.matches,
          matchedLines: msg.data.stats.matched_lines,
          filesMatched: msg.data.stats.searches_with_match,
          filesSearched: msg.data.stats.searches,
          bytesSearched: msg.data.stats.bytes_searched,
          searchTime: msg.data.stats.elapsed.human,
        };
      }
    } catch {
      // Skip malformed JSON lines
    }
  }

  // Specific before/after context takes precedence over general contextLines
  const before = query.beforeContext ?? query.contextLines ?? 0;
  const after = query.afterContext ?? query.contextLines ?? 0;
  const maxLength =
    query.matchContentLength || RESOURCE_LIMITS.DEFAULT_MATCH_CONTENT_LENGTH;

  const files: RipgrepFileMatches[] = Array.from(fileMap.entries()).map(
    ([path, entry]) => {
      const matches: RipgrepMatch[] = entry.rawMatches.map(m => {
        const contextLines: string[] = [];
        // prepend before-context
        for (let i = before; i > 0; i--) {
          const ctx = entry.contexts.get(m.lineNumber - i);
          if (ctx) contextLines.push(ctx);
        }
        // current line
        contextLines.push(m.lineText);
        // append after-context
        for (let i = 1; i <= after; i++) {
          const ctx = entry.contexts.get(m.lineNumber + i);
          if (ctx) contextLines.push(ctx);
        }

        let value = contextLines.join('\n');
        // Use Array.from/spread to split by code points (handles surrogate pairs correctly)
        // This prevents splitting multi-byte characters like emojis
        const charArray = [...value];
        if (charArray.length > maxLength) {
          // Slice to maxLength - 3 to leave room for '...'
          value = charArray.slice(0, maxLength - 3).join('') + '...';
        }

        return {
          value,
          location: { charOffset: m.absoluteOffset, charLength: m.matchLength },
          line: m.lineNumber,
          column: m.column,
        };
      });

      return {
        path,
        matchCount: matches.length,
        matches,
      };
    }
  );

  return { files, stats };
}

async function getFileModifiedTime(
  filePath: string
): Promise<string | undefined> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.toISOString();
  } catch {
    return undefined;
  }
}
