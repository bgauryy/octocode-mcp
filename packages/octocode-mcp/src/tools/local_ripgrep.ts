import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { RipgrepCommandBuilder } from '../commands/RipgrepCommandBuilder.js';
import {
  GrepCommandBuilder,
  getGrepFeatureWarnings,
} from '../commands/GrepCommandBuilder.js';
import {
  safeExec,
  checkCommandAvailability,
  getMissingCommandError,
} from '../utils/exec/index.js';
import { getHints, getLargeFileWorkflowHints } from './hints/index.js';
import {
  validateRipgrepQuery,
  applyWorkflowMode,
  type RipgrepQuery,
  BulkRipgrepQuerySchema,
  LOCAL_RIPGREP_DESCRIPTION,
} from '../scheme/local_ripgrep.js';
import {
  validateToolPath,
  createErrorResult,
} from '../utils/local/utils/toolHelpers.js';
import { byteToCharIndex, byteSlice } from '../utils/local/utils/byteOffset.js';
import { RESOURCE_LIMITS } from '../utils/constants.js';
import { TOOL_NAMES } from './toolMetadata.js';
import type {
  SearchContentResult,
  SearchStats,
  RipgrepFileMatches,
  RipgrepMatch,
} from '../utils/types.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ERROR_CODES, ToolErrors } from '../errorCodes.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';

/**
 * Register the local ripgrep search tool with the MCP server.
 * Follows the same pattern as GitHub tools for consistency.
 */
export function registerLocalRipgrepTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.LOCAL_RIPGREP,
    {
      description: LOCAL_RIPGREP_DESCRIPTION,
      inputSchema: BulkRipgrepQuerySchema,
      annotations: {
        title: 'Local Ripgrep Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: { queries: RipgrepQuery[] }): Promise<CallToolResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return executeBulkOperation<RipgrepQuery, any>(
        args.queries || [],
        async query => await searchContentRipgrep(query),
        { toolName: TOOL_NAMES.LOCAL_RIPGREP }
      );
    }
  );
}

export async function searchContentRipgrep(
  query: RipgrepQuery
): Promise<SearchContentResult> {
  const configuredQuery = applyWorkflowMode(query);

  try {
    // Check if ripgrep is available
    const rgAvailability = await checkCommandAvailability('rg');

    if (rgAvailability.available) {
      // Use ripgrep (preferred - faster, more features)
      return await executeRipgrepSearch(configuredQuery);
    }

    // rg not available - try grep fallback
    const grepAvailability = await checkCommandAvailability('grep');
    if (!grepAvailability.available) {
      // Neither rg nor grep available
      const toolError = ToolErrors.commandNotAvailable(
        'rg or grep',
        `${getMissingCommandError('rg')} Alternatively, ensure grep is in PATH.`
      );
      return createErrorResult(toolError, configuredQuery, {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
      }) as SearchContentResult;
    }

    // Check for features that don't work with grep
    if (configuredQuery.multiline) {
      return createErrorResult(
        new Error(
          'multiline patterns require ripgrep (rg). Install ripgrep or remove multiline option.'
        ),
        configuredQuery,
        { toolName: TOOL_NAMES.LOCAL_RIPGREP }
      ) as SearchContentResult;
    }

    // Use grep fallback
    return await executeGrepSearch(configuredQuery);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

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

    return createErrorResult(error, configuredQuery, {
      toolName: TOOL_NAMES.LOCAL_RIPGREP,
    }) as SearchContentResult;
  }
}

/**
 * Execute search using ripgrep (rg) - preferred engine
 */
async function executeRipgrepSearch(
  configuredQuery: RipgrepQuery
): Promise<SearchContentResult> {
  const validation = validateRipgrepQuery(configuredQuery);
  if (!validation.isValid) {
    return createErrorResult(
      new Error(`Query validation failed: ${validation.errors.join(', ')}`),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
        extra: { warnings: validation.warnings },
      }
    ) as SearchContentResult;
  }

  const pathValidation = validateToolPath(
    configuredQuery,
    TOOL_NAMES.LOCAL_RIPGREP
  );
  if (!pathValidation.isValid) {
    return {
      ...pathValidation.errorResult,
      warnings: validation.warnings,
    } as SearchContentResult;
  }

  // Use sanitized path (includes tilde expansion)
  configuredQuery.path = pathValidation.sanitizedPath!;

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

  // Check for timeout specifically
  if (result.stderr?.includes('timeout') || result.code === null) {
    const timeoutMs = RESOURCE_LIMITS.DEFAULT_EXEC_TIMEOUT_MS;
    return {
      status: 'error',
      errorCode: ERROR_CODES.COMMAND_TIMEOUT,
      path: configuredQuery.path,
      searchEngine: 'rg',
      researchGoal: configuredQuery.researchGoal,
      reasoning: configuredQuery.reasoning,
      hints: [
        `Search timed out after ${timeoutMs / 1000} seconds.`,
        'Try a more specific path or add type/include filters to narrow the search.',
        'Use filesOnly=true for faster discovery.',
        'Consider excluding large directories with excludeDir.',
        ...chunkingWarnings,
      ],
    } as SearchContentResult;
  }

  // Check for empty results (exit code 1) or successful run with empty output
  if (result.code === 1 || (result.success && !result.stdout.trim())) {
    return {
      status: 'empty',
      path: configuredQuery.path,
      searchEngine: 'rg',
      warnings: [...validation.warnings, ...chunkingWarnings],
      researchGoal: configuredQuery.researchGoal,
      reasoning: configuredQuery.reasoning,
      hints: getHints(TOOL_NAMES.LOCAL_RIPGREP, 'empty'),
    };
  }

  // Handle other errors (exit code > 1)
  if (!result.success) {
    return createErrorResult(
      new Error(`Ripgrep failed (exit code ${result.code}): ${result.stderr}`),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
      }
    ) as SearchContentResult;
  }

  const { files: parsedFiles, stats } = parseRipgrepJson(
    result.stdout,
    configuredQuery
  );

  return buildSearchResult(
    parsedFiles,
    configuredQuery,
    'rg',
    [...validation.warnings, ...chunkingWarnings],
    stats
  );
}

/**
 * Execute search using grep (fallback when ripgrep not available)
 */
async function executeGrepSearch(
  configuredQuery: RipgrepQuery
): Promise<SearchContentResult> {
  // Get warnings about unsupported grep features
  const grepWarnings = getGrepFeatureWarnings(configuredQuery);
  grepWarnings.unshift(
    'Using grep fallback (ripgrep not available). Some features may be limited.'
  );

  const validation = validateRipgrepQuery(configuredQuery);
  if (!validation.isValid) {
    return createErrorResult(
      new Error(`Query validation failed: ${validation.errors.join(', ')}`),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
        extra: { warnings: [...grepWarnings, ...validation.warnings] },
      }
    ) as SearchContentResult;
  }

  const pathValidation = validateToolPath(
    configuredQuery,
    TOOL_NAMES.LOCAL_RIPGREP
  );
  if (!pathValidation.isValid) {
    return {
      ...pathValidation.errorResult,
      warnings: [...grepWarnings, ...validation.warnings],
    } as SearchContentResult;
  }

  // Use sanitized path (includes tilde expansion)
  configuredQuery.path = pathValidation.sanitizedPath!;

  const dirStats = await estimateDirectoryStats(configuredQuery.path);
  const chunkingWarnings: string[] = [];

  if (dirStats.isLarge && !configuredQuery.filesOnly) {
    chunkingWarnings.push(
      `Large directory detected (~${Math.round(dirStats.estimatedSizeMB)}MB, ~${dirStats.estimatedFileCount} files). Consider chunking workflow for better performance.`
    );
    chunkingWarnings.push(...getLargeFileWorkflowHints('search'));
  }

  const builder = new GrepCommandBuilder();
  const { command, args } = builder.fromQuery(configuredQuery).build();

  const result = await safeExec(command, args);

  // Check for timeout
  if (result.stderr?.includes('timeout') || result.code === null) {
    const timeoutMs = RESOURCE_LIMITS.DEFAULT_EXEC_TIMEOUT_MS;
    return {
      status: 'error',
      errorCode: ERROR_CODES.COMMAND_TIMEOUT,
      path: configuredQuery.path,
      searchEngine: 'grep',
      researchGoal: configuredQuery.researchGoal,
      reasoning: configuredQuery.reasoning,
      hints: [
        `Search timed out after ${timeoutMs / 1000} seconds.`,
        'Try a more specific path or add type/include filters to narrow the search.',
        'Use filesOnly=true for faster discovery.',
        'Consider excluding large directories with excludeDir.',
        ...chunkingWarnings,
      ],
    } as SearchContentResult;
  }

  // grep returns exit code 1 when no matches found (not an error)
  if (result.code === 1 || (result.success && !result.stdout.trim())) {
    return {
      status: 'empty',
      path: configuredQuery.path,
      searchEngine: 'grep',
      warnings: [...grepWarnings, ...validation.warnings, ...chunkingWarnings],
      researchGoal: configuredQuery.researchGoal,
      reasoning: configuredQuery.reasoning,
      hints: getHints(TOOL_NAMES.LOCAL_RIPGREP, 'empty'),
    };
  }

  // Handle errors (exit code > 1)
  if (!result.success) {
    return createErrorResult(
      new Error(`Grep failed (exit code ${result.code}): ${result.stderr}`),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
      }
    ) as SearchContentResult;
  }

  // Parse grep output
  const parsedFiles = parseGrepOutput(result.stdout, configuredQuery);

  return buildSearchResult(parsedFiles, configuredQuery, 'grep', [
    ...grepWarnings,
    ...validation.warnings,
    ...chunkingWarnings,
  ]);
}

/**
 * Build the final search result with pagination and metadata
 */
async function buildSearchResult(
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
          location: {
            byteOffset: m.absoluteOffset,
            byteLength: m.matchLength,
            charOffset: m.absoluteOffset,
            charLength: m.matchLength,
          },
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

/**
 * Parse grep output into structured format
 * Grep output format: filename:lineNumber:content (with -n -H flags)
 */
function parseGrepOutput(
  output: string,
  query: RipgrepQuery
): RipgrepFileMatches[] {
  const lines = output.trim().split('\n').filter(Boolean);

  type RawMatch = {
    lineText: string;
    lineNumber: number;
    column: number;
  };

  const fileMap = new Map<string, RawMatch[]>();

  // Grep output format with -n -H: filename:lineNumber:content
  // For files-only mode (-l): just filename
  if (query.filesOnly) {
    // Each line is just a filename
    for (const line of lines) {
      const path = line.trim();
      if (path && !fileMap.has(path)) {
        fileMap.set(path, []);
      }
    }
  } else {
    // Parse filename:lineNumber:content format
    for (const line of lines) {
      // Handle the case where filename might contain colons
      // Format is: path:lineNumber:content
      // We need to find the first colon after the path (line number is always numeric)
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (match) {
        const [, matchPath, lineNumStr, matchContent] = match;
        // These are guaranteed to be defined when the regex matches
        const path = matchPath!;
        const content = matchContent!;
        const lineNumber = parseInt(lineNumStr!, 10);

        if (!fileMap.has(path)) {
          fileMap.set(path, []);
        }

        // Try to find the column (position of pattern in the line)
        // For simplicity, we set column to 0 since grep doesn't provide it
        fileMap.get(path)!.push({
          lineText: content,
          lineNumber,
          column: 0,
        });
      } else if (line.includes(':')) {
        // Fallback: try to parse as filename:content (no line number)
        const colonIdx = line.indexOf(':');
        const path = line.substring(0, colonIdx);
        const content = line.substring(colonIdx + 1);

        if (path && !path.includes('\0')) {
          if (!fileMap.has(path)) {
            fileMap.set(path, []);
          }
          fileMap.get(path)!.push({
            lineText: content,
            lineNumber: 0,
            column: 0,
          });
        }
      }
    }
  }

  const maxLength =
    query.matchContentLength || RESOURCE_LIMITS.DEFAULT_MATCH_CONTENT_LENGTH;

  const files: RipgrepFileMatches[] = Array.from(fileMap.entries()).map(
    ([path, rawMatches]) => {
      const matches: RipgrepMatch[] = rawMatches.map(m => {
        let value = m.lineText;
        const charArray = [...value];
        if (charArray.length > maxLength) {
          value = charArray.slice(0, maxLength - 3).join('') + '...';
        }

        return {
          value,
          location: {
            // grep doesn't provide byte offsets, use 0 as placeholder
            byteOffset: 0,
            byteLength: 0,
            charOffset: 0,
            charLength: value.length,
          },
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

  return files;
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

/**
 * Compute actual character offsets for matches by reading file content.
 * This converts ripgrep's byte offsets to JavaScript string indices.
 */
async function computeCharacterOffsets(
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
