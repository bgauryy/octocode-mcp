import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { executeViewStructure } from './execution.js';
import type { AnySchema } from '../../types/toolTypes.js';
import { withBasicSecurityValidation } from '../../security/withSecurityValidation.js';
import { LsCommandBuilder } from '../../commands/LsCommandBuilder.js';
import {
  safeExec,
  checkCommandAvailability,
  getMissingCommandError,
} from '../../utils/exec/index.js';
import { getHints } from '../../hints/index.js';
import { STATIC_TOOL_NAMES, TOOL_NAMES } from '../toolMetadata.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import {
  applyPagination,
  generatePaginationHints,
} from '../../utils/pagination/index.js';
import { parseFileSize } from '../../utils/file/size.js';
import { RESOURCE_LIMITS, DEFAULTS } from '../../utils/core/constants.js';
import type {
  ViewStructureQuery,
  ViewStructureResult,
} from '../../utils/core/types.js';
import path from 'path';
import { ToolErrors } from '../../errorCodes.js';
import {
  BulkViewStructureSchema,
  LOCAL_VIEW_STRUCTURE_DESCRIPTION,
} from './scheme.js';
import {
  applyEntryFilters,
  formatEntryString,
  type DirectoryEntry,
} from './structureFilters.js';
import { parseLsSimple, parseLsLongFormat } from './structureParser.js';
import { walkDirectory } from './structureWalker.js';

/**
 * Register the local view structure tool with the MCP server.
 * Follows the same pattern as GitHub tools for consistency.
 */
export function registerLocalViewStructureTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
    {
      description: LOCAL_VIEW_STRUCTURE_DESCRIPTION,
      inputSchema: BulkViewStructureSchema as unknown as AnySchema,
      annotations: {
        title: 'Local View Structure',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withBasicSecurityValidation(executeViewStructure)
  );
}

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
          ...getHints(STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE, 'error'),
        ],
      };
    }

    const entries = query.details
      ? parseLsLongFormat(result.stdout, query.showFileLastModified)
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
    const totalSize = totalSizeBytes;

    const entriesPerPage =
      query.entriesPerPage || RESOURCE_LIMITS.DEFAULT_ENTRIES_PER_PAGE;
    const entryPageNumber = query.entryPageNumber || 1;
    const totalPages = Math.ceil(totalEntries / entriesPerPage);
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

    if (
      !query.charLength &&
      totalEntries > RESOURCE_LIMITS.MAX_ENTRIES_BEFORE_PAGINATION &&
      !query.entriesPerPage
    ) {
      const estimatedSize = totalEntries * (query.details ? 150 : 30);
      const toolError = ToolErrors.outputTooLarge(
        estimatedSize,
        RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH
      );
      return {
        status: 'error',
        errorCode: toolError.errorCode,
        path: query.path,
        totalFiles,
        totalDirectories,
        totalSize,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          `Directory contains ${totalEntries} entries - overwhelming to view all at once`,
          'Use entriesPerPage to paginate through results (sorted by modification time, most recent first)',
          'Why pagination helps: Lets you focus on relevant files first, reduces token usage, easier to navigate',
        ],
      };
    }

    const structuredLines = paginatedEntries.map(entry =>
      formatEntryString(entry, 0)
    );
    let structuredOutput = structuredLines.join('\n');
    const warnings: string[] = [];

    let paginationMetadata: ReturnType<typeof applyPagination> | null = null;

    // Auto-pagination: Apply character limit if output is large
    let effectiveCharLength = query.charLength;
    if (
      !query.charLength &&
      structuredOutput.length > DEFAULTS.MAX_OUTPUT_CHARS
    ) {
      effectiveCharLength = 5000;
      warnings.push(
        `Auto-paginated: Content (${structuredOutput.length} chars) exceeds ${DEFAULTS.MAX_OUTPUT_CHARS} char limit`
      );
    }

    if (effectiveCharLength) {
      paginationMetadata = applyPagination(
        structuredOutput,
        query.charOffset ?? 0,
        effectiveCharLength
      );
      structuredOutput = paginationMetadata.paginatedContent;
    }

    const status = totalEntries > 0 ? 'hasResults' : 'empty';
    const entryPaginationHints = [
      `Page ${entryPageNumber}/${totalPages} (showing ${paginatedEntries.length} of ${totalEntries})`,
      `Total: ${totalFiles} files, ${totalDirectories} directories`,
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
      ...(paginationMetadata && {
        charOffset: paginationMetadata.charOffset,
        charLength: paginationMetadata.charLength,
        totalChars: paginationMetadata.totalChars,
      }),
    };

    return {
      status,
      path: query.path,
      cwd: process.cwd(),
      structuredOutput,
      totalFiles,
      totalDirectories,
      totalSize,
      pagination,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      ...(warnings.length > 0 && { warnings }),
      hints: [
        ...entryPaginationHints,
        ...getHints(STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE, status),
        ...(paginationMetadata
          ? generatePaginationHints(paginationMetadata, {
              toolName: STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
            })
          : []),
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
      hints: getHints(STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE, 'error'),
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

  await walkDirectory(
    basePath,
    basePath,
    0,
    maxDepth,
    entries,
    maxEntries,
    query.hidden,
    showModified
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
  const totalSize = totalSizeBytes;

  const totalEntries = filteredEntries.length;

  // Apply entry-based pagination
  const entriesPerPage =
    query.entriesPerPage || RESOURCE_LIMITS.DEFAULT_ENTRIES_PER_PAGE;
  const entryPageNumber = query.entryPageNumber || 1;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
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

  if (
    !query.charLength &&
    totalEntries > RESOURCE_LIMITS.MAX_ENTRIES_BEFORE_PAGINATION &&
    !query.entriesPerPage
  ) {
    const estimatedSize = totalEntries * 150;
    const toolError = ToolErrors.outputTooLarge(
      estimatedSize,
      RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH
    );
    return {
      status: 'error',
      errorCode: toolError.errorCode,
      path: query.path,
      totalFiles,
      totalDirectories,
      totalSize,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        `Recursive listing found ${totalEntries} entries - too much to process at once`,
        'Options: Use entriesPerPage to paginate through results, or limit to reduce scope',
        'Alternative: Start with depth=1 to get overview, then drill into specific subdirectories',
        'Why this matters: Large trees overwhelm context and make it hard to find what you need',
      ],
    };
  }

  const structuredLines = paginatedEntries.map(entry => {
    // Fallback to path splitting if depth not present (e.g. from ls parsing)
    const depth = entry.depth ?? entry.name.split(path.sep).length - 1;
    return formatEntryString(entry, depth);
  });
  let structuredOutput = structuredLines.join('\n');
  const warnings: string[] = [];

  let paginationMetadata: ReturnType<typeof applyPagination> | null = null;

  // Auto-pagination: Apply character limit if output is large
  let effectiveCharLength = query.charLength;
  if (
    !query.charLength &&
    structuredOutput.length > DEFAULTS.MAX_OUTPUT_CHARS
  ) {
    effectiveCharLength = RESOURCE_LIMITS.RECOMMENDED_CHAR_LENGTH;
    warnings.push(
      `Auto-paginated: Content (${structuredOutput.length} chars) exceeds ${DEFAULTS.MAX_OUTPUT_CHARS} char limit`
    );
  }

  if (effectiveCharLength) {
    paginationMetadata = applyPagination(
      structuredOutput,
      query.charOffset ?? 0,
      effectiveCharLength
    );
    structuredOutput = paginationMetadata.paginatedContent;
  }

  const status = totalEntries > 0 ? 'hasResults' : 'empty';
  const baseHints = getHints(
    STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE as 'localViewStructure',
    status
  );

  const entryPaginationHints = [
    `Page ${entryPageNumber}/${totalPages} (showing ${paginatedEntries.length} of ${totalEntries})`,
    `Total: ${totalFiles} files, ${totalDirectories} directories`,
    entryPaginationInfo.hasMore
      ? `Next: entryPageNumber=${entryPageNumber + 1}`
      : 'Final page',
  ];

  const paginationHints = paginationMetadata
    ? generatePaginationHints(paginationMetadata, {
        toolName: STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
      })
    : [];

  const pagination = {
    currentPage: entryPaginationInfo.currentPage,
    totalPages: entryPaginationInfo.totalPages,
    entriesPerPage: entryPaginationInfo.entriesPerPage,
    totalEntries: entryPaginationInfo.totalEntries,
    hasMore: entryPaginationInfo.hasMore,
    ...(paginationMetadata && {
      charOffset: paginationMetadata.charOffset,
      charLength: paginationMetadata.charLength,
      totalChars: paginationMetadata.totalChars,
    }),
  };

  return {
    status,
    path: query.path,
    cwd: process.cwd(),
    structuredOutput,
    totalFiles,
    totalDirectories,
    totalSize,
    pagination,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    ...(warnings.length > 0 && { warnings }),
    hints: [...baseHints, ...entryPaginationHints, ...paginationHints],
  };
}
