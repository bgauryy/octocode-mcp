import { LsCommandBuilder } from '../../commands/LsCommandBuilder.js';
import {
  safeExec,
  checkCommandAvailability,
  getMissingCommandError,
} from '../../utils/exec/index.js';
import { getHints } from '../../hints/index.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { parseFileSize, formatFileSize } from '../../utils/file/size.js';
import { RESOURCE_LIMITS } from '../../utils/core/constants.js';
import type {
  ViewStructureQuery,
  ViewStructureResult,
} from '../../utils/core/types.js';
import { ToolErrors } from '../../errorCodes.js';
import {
  applyEntryFilters,
  toEntryObject,
  type DirectoryEntry,
} from './structureFilters.js';
import { parseLsSimple, parseLsLongFormat } from './structureParser.js';
import { walkDirectory, type WalkStats } from './structureWalker.js';

export async function viewStructure(
  query: ViewStructureQuery
): Promise<ViewStructureResult> {
  try {
    const pathValidation = validateToolPath(
      query,
      TOOL_NAMES.LOCAL_VIEW_STRUCTURE
    );
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as ViewStructureResult;
    }

    // For recursive mode, we use Node.js fs directly (no external command needed)
    if (query.depth || query.recursive) {
      return await viewStructureRecursive(
        query,
        pathValidation.sanitizedPath!,
        query.showFileLastModified
      );
    }

    // For non-recursive mode, check if ls is available
    const lsAvailability = await checkCommandAvailability('ls');
    if (!lsAvailability.available) {
      const toolError = ToolErrors.commandNotAvailable(
        'ls',
        getMissingCommandError('ls')
      );
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
      }) as ViewStructureResult;
    }

    const builder = new LsCommandBuilder();
    const { command, args } = builder.fromQuery(query).build();

    const result = await safeExec(command, args);

    if (!result.success) {
      // Provide more detailed error message including stderr
      const stderrMsg = result.stderr?.trim();
      const toolError = ToolErrors.commandExecutionFailed(
        'ls',
        new Error(stderrMsg || 'Unknown error'),
        stderrMsg
      );
      return {
        status: 'error',
        errorCode: toolError.errorCode,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          stderrMsg ? `Error: ${stderrMsg}` : 'ls command failed',
          ...getHints(TOOL_NAMES.LOCAL_VIEW_STRUCTURE, 'error'),
        ],
      };
    }

    const entries = query.details
      ? parseLsLongFormat(result.stdout, true)
      : await parseLsSimple(
          result.stdout,
          pathValidation.sanitizedPath!,
          query.showFileLastModified
        );

    let filteredEntries = applyEntryFilters(entries, query);

    if (query.limit) {
      filteredEntries = filteredEntries.slice(0, query.limit);
    }

    const totalEntries = filteredEntries.length;
    const totalFiles = filteredEntries.filter(e => e.type === 'file').length;
    const totalDirectories = filteredEntries.filter(
      e => e.type === 'directory'
    ).length;

    let totalSizeBytes = 0;
    for (const entry of filteredEntries) {
      if (entry.type === 'file' && entry.size) {
        totalSizeBytes += parseFileSize(entry.size);
      }
    }

    const entriesPerPage =
      query.entriesPerPage || RESOURCE_LIMITS.DEFAULT_ENTRIES_PER_PAGE;
    const totalPages = Math.max(1, Math.ceil(totalEntries / entriesPerPage));
    const entryPageNumber = Math.min(query.entryPageNumber || 1, totalPages);
    const startIdx = (entryPageNumber - 1) * entriesPerPage;
    const endIdx = Math.min(startIdx + entriesPerPage, totalEntries);

    const paginatedEntries = filteredEntries.slice(startIdx, endIdx);

    const entryPaginationInfo = {
      currentPage: entryPageNumber,
      totalPages,
      entriesPerPage,
      totalEntries,
      hasMore: entryPageNumber < totalPages,
    };

    const outputEntries = paginatedEntries.map(entry => toEntryObject(entry));
    const warnings: string[] = [];

    const status = totalEntries > 0 ? 'hasResults' : 'empty';
    const entryPaginationHints = [
      `Page ${entryPageNumber}/${totalPages} (showing ${paginatedEntries.length} of ${totalEntries})`,
      entryPaginationInfo.hasMore
        ? `Next: entryPageNumber=${entryPageNumber + 1}`
        : 'Final page',
    ];

    const pagination = {
      currentPage: entryPaginationInfo.currentPage,
      totalPages: entryPaginationInfo.totalPages,
      entriesPerPage: entryPaginationInfo.entriesPerPage,
      totalEntries: entryPaginationInfo.totalEntries,
      hasMore: entryPaginationInfo.hasMore,
    };

    return {
      status,
      path: query.path,
      entries: outputEntries,
      summary: `${totalEntries} entries (${totalFiles} files, ${totalDirectories} dirs, ${formatFileSize(totalSizeBytes)})`,
      pagination,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      ...(warnings.length > 0 && { warnings }),
      hints: [
        ...entryPaginationHints,
        ...getHints(TOOL_NAMES.LOCAL_VIEW_STRUCTURE, status, {
          entryCount: totalEntries,
        }),
      ],
    };
  } catch (error) {
    const toolError = ToolErrors.toolExecutionFailed(
      'LOCAL_VIEW_STRUCTURE',
      error instanceof Error ? error : undefined
    );
    return {
      status: 'error',
      errorCode: toolError.errorCode,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getHints(TOOL_NAMES.LOCAL_VIEW_STRUCTURE, 'error'),
    };
  }
}

async function viewStructureRecursive(
  query: ViewStructureQuery,
  basePath: string,
  showModified: boolean = false
): Promise<ViewStructureResult> {
  const entries: DirectoryEntry[] = [];
  const maxDepth = query.depth || (query.recursive ? 5 : 2);

  const maxEntries = query.limit ? query.limit * 2 : 10000;

  const walkStats: WalkStats = { skipped: 0 };

  await walkDirectory(
    basePath,
    basePath,
    0,
    maxDepth,
    entries,
    maxEntries,
    query.hidden,
    showModified,
    walkStats,
    query.details ?? false
  );

  let filteredEntries = applyEntryFilters(entries, query);

  if (query.sortBy) {
    filteredEntries = filteredEntries.sort((a, b) => {
      let comparison = 0;
      switch (query.sortBy) {
        case 'size': {
          // Use numeric comparison instead of string comparison
          const aSize = a.size ? parseFileSize(a.size) : 0;
          const bSize = b.size ? parseFileSize(b.size) : 0;
          comparison = aSize - bSize;
          break;
        }
        case 'time':
          if (showModified && a.modified && b.modified) {
            comparison = a.modified.localeCompare(b.modified);
          } else {
            // Fallback to name when modified is not available
            comparison = a.name.localeCompare(b.name);
          }
          break;
        case 'extension':
          comparison = (a.extension || '').localeCompare(b.extension || '');
          break;
        case 'name':
        default:
          comparison = a.name.localeCompare(b.name);
          break;
      }
      return query.reverse ? -comparison : comparison;
    });
  }

  if (query.limit) {
    filteredEntries = filteredEntries.slice(0, query.limit);
  }

  const totalFiles = filteredEntries.filter(e => e.type === 'file').length;
  const totalDirectories = filteredEntries.filter(
    e => e.type === 'directory'
  ).length;

  let totalSizeBytes = 0;
  for (const entry of filteredEntries) {
    if (entry.type === 'file' && entry.size) {
      totalSizeBytes += parseFileSize(entry.size);
    }
  }

  const totalEntries = filteredEntries.length;

  // Apply entry-based pagination
  const entriesPerPage =
    query.entriesPerPage || RESOURCE_LIMITS.DEFAULT_ENTRIES_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(totalEntries / entriesPerPage));
  const entryPageNumber = Math.min(query.entryPageNumber || 1, totalPages);
  const startIdx = (entryPageNumber - 1) * entriesPerPage;
  const endIdx = Math.min(startIdx + entriesPerPage, totalEntries);

  const paginatedEntries = filteredEntries.slice(startIdx, endIdx);

  const entryPaginationInfo = {
    currentPage: entryPageNumber,
    totalPages,
    entriesPerPage,
    totalEntries,
    hasMore: entryPageNumber < totalPages,
  };

  const outputEntries = paginatedEntries.map(entry => toEntryObject(entry));
  const warnings: string[] = [];

  if (walkStats.skipped > 0) {
    warnings.push(
      `${walkStats.skipped} entries skipped due to permission errors`
    );
  }

  const status = totalEntries > 0 ? 'hasResults' : 'empty';
  const baseHints = getHints(TOOL_NAMES.LOCAL_VIEW_STRUCTURE, status);

  const entryPaginationHints = [
    `Page ${entryPageNumber}/${totalPages} (showing ${paginatedEntries.length} of ${totalEntries})`,
    entryPaginationInfo.hasMore
      ? `Next: entryPageNumber=${entryPageNumber + 1}`
      : 'Final page',
  ];

  const pagination = {
    currentPage: entryPaginationInfo.currentPage,
    totalPages: entryPaginationInfo.totalPages,
    entriesPerPage: entryPaginationInfo.entriesPerPage,
    totalEntries: entryPaginationInfo.totalEntries,
    hasMore: entryPaginationInfo.hasMore,
  };

  return {
    status,
    path: query.path,
    entries: outputEntries,
    summary: `${totalEntries} entries (${totalFiles} files, ${totalDirectories} dirs, ${formatFileSize(totalSizeBytes)})`,
    pagination,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    ...(warnings.length > 0 && { warnings }),
    hints: [...baseHints, ...entryPaginationHints],
  };
}
