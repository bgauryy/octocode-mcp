import { RipgrepCommandBuilder } from '../commands/RipgrepCommandBuilder.js';
import { safeExec } from '../utils/exec.js';
import { getToolHints, getLargeFileWorkflowHints } from './hints.js';
import {
  validateRipgrepQuery,
  applyWorkflowMode,
  type RipgrepQuery,
} from '../scheme/local_ripgrep.js';
import { validateToolPath, createErrorResult } from '../utils/toolHelpers.js';
import { RESOURCE_LIMITS, DEFAULTS } from '../constants.js';
import type {
  SearchContentResult,
  SearchStats,
  RipgrepFileMatches,
  RipgrepMatch,
} from '../types.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ERROR_CODES } from '../errors/errorCodes.js';
import { spawn } from 'child_process';
import { validateCommand } from '../security/commandValidator.js';
import { validateExecutionContext } from '../security/executionContextValidator.js';

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

    // Security validation
    const cmdValidation = validateCommand(command, args);
    if (!cmdValidation.isValid) {
      throw new Error(`Command validation failed: ${cmdValidation.error}`);
    }

    const contextValidation = validateExecutionContext(configuredQuery.path);
    if (!contextValidation.isValid) {
      throw new Error(
        `Execution context validation failed: ${contextValidation.error}`
      );
    }

    // Stream execution
    const { fileMap, warnings: streamWarnings } = await executeRipgrepStream(
      command,
      args,
      configuredQuery.path
    );

    if (fileMap.size === 0) {
      return {
        status: 'empty',
        path: configuredQuery.path,
        searchEngine: 'rg',
        warnings: [
          ...validation.warnings,
          ...chunkingWarnings,
          ...streamWarnings,
        ],
        researchGoal: configuredQuery.researchGoal,
        reasoning: configuredQuery.reasoning,
        hints: getToolHints('LOCAL_RIPGREP', 'empty'),
      };
    }

    const files: RipgrepFileMatches[] = processResults(
      fileMap,
      configuredQuery
    );

    // Add modified time if requested
    if (configuredQuery.showFileLastModified) {
      await Promise.all(
        files.map(async (f) => {
          f.modified = await getFileModifiedTime(f.path);
        })
      );

      files.sort((a, b) => {
        if (a.modified && b.modified) {
          return (
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
          );
        }
        return a.path.localeCompare(b.path);
      });
    } else {
      files.sort((a, b) => a.path.localeCompare(b.path));
    }

    // Apply maxFiles limit if specified
    let limitedFiles = files;
    let wasLimited = false;
    if (configuredQuery.maxFiles && files.length > configuredQuery.maxFiles) {
      limitedFiles = files.slice(0, configuredQuery.maxFiles);
      wasLimited = true;
    }

    const totalFiles = limitedFiles.length;
    // Recalculate totalMatches based on limited files
    const totalMatches = limitedFiles.reduce((sum, f) => sum + f.matchCount, 0);

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

    const finalFiles: RipgrepFileMatches[] = paginatedFiles.map((file) => {
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
      if (file.modified) {
        result.modified = file.modified;
      }
      return result;
    });

    const paginationHints = [
      `File page ${filePageNumber}/${totalFilePages} (showing ${finalFiles.length} of ${totalFiles})`,
      `Total: ${totalMatches} matches across ${totalFiles} files`,
      filePageNumber < totalFilePages
        ? `Next: filePageNumber=${filePageNumber + 1}`
        : 'Final page',
    ];

    if (wasLimited) {
      paginationHints.push(
        `Results limited to ${configuredQuery.maxFiles} files (found ${files.length} matching)`
      );
    }

    // Add stream warnings
    if (streamWarnings.length > 0) {
      paginationHints.push(...streamWarnings);
    }

    const filesWithMoreMatches = finalFiles.filter(
      (f) => f.pagination?.hasMore
    );
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
      warnings: [
        ...validation.warnings,
        ...chunkingWarnings,
        ...streamWarnings,
      ],
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
          'Output exceeded limits - your pattern matched too broadly.',
          'Is the pattern too generic? Make it specific to target what you actually need',
          'Searching everything? Add type filters or path restrictions to focus scope',
          'For node_modules: Target specific packages rather than searching the entire directory',
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

interface RawMatch {
  lineText: string;
  lineNumber: number;
  absoluteOffset: number;
  column: number;
  matchLength: number;
}

interface FileEntry {
  rawMatches: RawMatch[];
  contexts: Map<number, string>;
}

async function executeRipgrepStream(
  command: string,
  args: string[],
  cwd: string
): Promise<{
  fileMap: Map<string, FileEntry>;
  stats: SearchStats;
  warnings: string[];
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env },
      timeout: DEFAULTS.COMMAND_TIMEOUT,
    });

    const fileMap = new Map<string, FileEntry>();
    let stats: SearchStats = {};
    const warnings: string[] = [];

    let buffer = '';
    let processedBytes = 0;
    const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB safety limit for output processing

    // Safety break if too many results
    const MAX_FILES = 2000;
    let killed = false;

    const cleanup = () => {
      if (!killed) {
        killed = true;
        child.kill();
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      if (killed) return;

      processedBytes += chunk.length;
      if (processedBytes > MAX_BUFFER_SIZE) {
        warnings.push(
          'Search stopped early: Output size limit exceeded (10MB)'
        );
        cleanup();
        return;
      }

      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          processJsonMessage(msg, fileMap, (s) => (stats = s));

          if (fileMap.size > MAX_FILES) {
            warnings.push(
              `Search stopped early: Too many matching files (>${MAX_FILES})`
            );
            cleanup();
            break;
          }
        } catch {
          // Skip unparseable lines
        }
      }
    });

    child.stderr.on('data', (_data) => {
      // Ignore stderr for now, mostly progress info
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const msg = JSON.parse(buffer);
          processJsonMessage(msg, fileMap, (s) => (stats = s));
        } catch {
          // Ignore invalid JSON in buffer
        }
      }

      if (code === 0 || killed) {
        resolve({ fileMap, stats, warnings });
      } else {
        // ripgrep returns 1 if no matches found, which is not an error for us
        // but if code > 1 it might be an error
        if (code === 1) {
          resolve({ fileMap, stats, warnings });
        } else {
          reject(new Error(`ripgrep exited with code ${code}`));
        }
      }
    });

    // Safety timeout
    setTimeout(() => {
      if (!killed && child.exitCode === null) {
        warnings.push('Search timed out');
        cleanup();
        // Resolve with what we have
        resolve({ fileMap, stats, warnings });
      }
    }, DEFAULTS.COMMAND_TIMEOUT);
  });
}

interface RipgrepJsonMessage {
  type: 'match' | 'context' | 'summary' | string;
  data: {
    path?: { text: string };
    lines?: { text: string };
    line_number?: number;
    absolute_offset?: number;
    submatches?: Array<{ start: number; end: number }>;
    stats?: {
      matches: number;
      matched_lines: number;
      searches_with_match: number;
      searches: number;
      bytes_searched: number;
      elapsed: { human: string };
    };
  };
}

function processJsonMessage(
  msg: RipgrepJsonMessage,
  fileMap: Map<string, FileEntry>,
  updateStats: (s: SearchStats) => void
) {
  if (msg.type === 'match' && msg.data.path && msg.data.lines) {
    const path = msg.data.path.text;
    const lineText = msg.data.lines.text;
    const lineNumber = msg.data.line_number ?? 0;
    const absoluteOffset = msg.data.absolute_offset ?? 0;

    if (!fileMap.has(path)) {
      fileMap.set(path, { rawMatches: [], contexts: new Map() });
    }
    const submatches = msg.data.submatches ?? [];
    const column = submatches.length > 0 ? submatches[0].start : 0;
    const matchLength =
      submatches.length > 0
        ? submatches[0].end - submatches[0].start
        : lineText.length;

    fileMap.get(path)!.rawMatches.push({
      lineText,
      lineNumber,
      absoluteOffset,
      column,
      matchLength,
    });
  } else if (msg.type === 'context' && msg.data.path && msg.data.lines) {
    const path = msg.data.path.text;
    const lineNumber = msg.data.line_number ?? 0;
    const lineText = msg.data.lines.text;

    if (!fileMap.has(path)) {
      fileMap.set(path, { rawMatches: [], contexts: new Map() });
    }
    fileMap.get(path)!.contexts.set(lineNumber, lineText);
  } else if (msg.type === 'summary' && msg.data.stats) {
    updateStats({
      matchCount: msg.data.stats.matches,
      matchedLines: msg.data.stats.matched_lines,
      filesMatched: msg.data.stats.searches_with_match,
      filesSearched: msg.data.stats.searches,
      bytesSearched: msg.data.stats.bytes_searched,
      searchTime: msg.data.stats.elapsed.human,
    });
  }
}

function processResults(
  fileMap: Map<string, FileEntry>,
  query: RipgrepQuery
): RipgrepFileMatches[] {
  const before = query.contextLines ?? query.beforeContext ?? 0;
  const after = query.contextLines ?? query.afterContext ?? 0;
  const maxLength =
    query.matchContentLength || RESOURCE_LIMITS.DEFAULT_MATCH_CONTENT_LENGTH;

  return Array.from(fileMap.entries()).map(([path, entry]) => {
    const matches: RipgrepMatch[] = entry.rawMatches.map((m) => {
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
      if (value.length > maxLength) {
        value = value.substring(0, maxLength) + '...';
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
  });
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
          const subFiles = subEntries.filter((e) => e.isFile());
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

export async function isRipgrepAvailable(): Promise<boolean> {
  try {
    const result = await safeExec('rg', ['--version'], { timeout: 1000 });
    return result.success;
  } catch {
    return false;
  }
}

export async function getRipgrepVersion(): Promise<string | null> {
  try {
    const result = await safeExec('rg', ['--version'], { timeout: 1000 });

    if (result.success) {
      const firstLine = result.stdout.split('\n')[0];
      return firstLine || null;
    }

    return null;
  } catch {
    return null;
  }
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
