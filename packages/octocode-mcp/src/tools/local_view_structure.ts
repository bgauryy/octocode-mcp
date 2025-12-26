import { LsCommandBuilder } from '../commands/LsCommandBuilder.js';
import { safeExec } from '../utils/local/utils/exec.js';
import { pathValidator } from '../security/pathValidator.js';
import { getExtension } from '../utils/fileFilters.js';
import { getToolHints } from './hints.js';
import {
  applyPagination,
  generatePaginationHints,
  createPaginationInfo,
} from '../utils/local/utils/pagination.js';
import {
  formatFileSize,
  parseFileSize,
} from '../utils/local/utils/fileSize.js';
import { RESOURCE_LIMITS } from '../utils/constants.js';
import type {
  ViewStructureQuery,
  ViewStructureResult,
} from '../utils/types.js';
import fs from 'fs';
import path from 'path';
import { ERROR_CODES, ToolErrors } from '../errorCodes.js';

/**
 * Internal directory entry for processing
 */
interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size?: string;
  modified?: string;
  permissions?: string;
  extension?: string;
}

/**
 * Apply query filters to entry list
 * Used by both CLI and recursive paths to ensure consistent filtering
 */
function applyEntryFilters(
  entries: DirectoryEntry[],
  query: ViewStructureQuery
): DirectoryEntry[] {
  let filtered = entries;

  if (query.pattern) {
    const pattern = query.pattern;

    const isGlob =
      pattern.includes('*') || pattern.includes('?') || pattern.includes('[');

    if (isGlob) {
      let regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

      regexPattern = regexPattern
        .replace(/\\\*/g, '.*')
        .replace(/\\\?/g, '.')
        .replace(/\\\[!/g, '[^')
        .replace(/\\\[/g, '[')
        .replace(/\\\]/g, ']');

      try {
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        filtered = filtered.filter(e => regex.test(e.name));
      } catch {
        filtered = filtered.filter(e => e.name.includes(pattern));
      }
    } else {
      filtered = filtered.filter(e => e.name.includes(pattern));
    }
  }

  if (query.extension) {
    filtered = filtered.filter(e => e.extension === query.extension);
  }

  if (query.extensions && query.extensions.length > 0) {
    filtered = filtered.filter(
      e => e.extension && query.extensions!.includes(e.extension)
    );
  }

  if (query.directoriesOnly) {
    filtered = filtered.filter(e => e.type === 'directory');
  }

  if (query.filesOnly) {
    filtered = filtered.filter(e => e.type === 'file');
  }

  return filtered;
}

/**
 * Format directory entry as compact string
 * Format: [TYPE] name (size) .ext
 */
function formatEntryString(entry: DirectoryEntry, indent: number = 0): string {
  const indentation = '  '.repeat(indent);
  const typeMarker =
    entry.type === 'directory'
      ? '[DIR] '
      : entry.type === 'symlink'
        ? '[LINK]'
        : '[FILE]';
  const nameDisplay =
    entry.type === 'directory' ? `${entry.name}/` : entry.name;

  if (entry.type === 'file' && entry.size) {
    const extStr = entry.extension ? ` .${entry.extension}` : '';
    return `${indentation}${typeMarker} ${nameDisplay} (${entry.size})${extStr}`;
  } else {
    return `${indentation}${typeMarker} ${nameDisplay}`;
  }
}

export async function viewStructure(
  query: ViewStructureQuery
): Promise<ViewStructureResult> {
  try {
    const pathValidation = pathValidator.validate(query.path);
    if (!pathValidation.isValid) {
      return {
        status: 'error',
        errorCode: ERROR_CODES.PATH_VALIDATION_FAILED,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_VIEW_STRUCTURE', 'error'),
      };
    }

    if (query.depth || query.recursive) {
      return await viewStructureRecursive(
        query,
        pathValidation.sanitizedPath!,
        query.showFileLastModified
      );
    }

    const builder = new LsCommandBuilder();
    const { command, args } = builder.fromQuery(query).build();

    const result = await safeExec(command, args);

    if (!result.success) {
      const toolError = ToolErrors.commandExecutionFailed(
        'ls',
        new Error(result.stderr)
      );
      return {
        status: 'error',
        errorCode: toolError.errorCode,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_VIEW_STRUCTURE', 'error'),
      };
    }

    const entries = query.details
      ? parseLsLongFormat(result.stdout, query.showFileLastModified)
      : await parseLsSimple(
          result.stdout,
          pathValidation.sanitizedPath!,
          query.showFileLastModified
        );

    // Apply filters using consolidated filter logic
    const filteredEntries = applyEntryFilters(entries, query);

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

    let paginatedEntries = filteredEntries.slice(startIdx, endIdx);

    const entryPaginationInfo = {
      currentPage: entryPageNumber,
      totalPages,
      entriesPerPage,
      totalEntries,
      hasMore: entryPageNumber < totalPages,
    };

    if (query.limit) {
      paginatedEntries = paginatedEntries.slice(0, query.limit);
    }

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

    let paginationMetadata: ReturnType<typeof applyPagination> | null = null;

    if (query.charLength) {
      paginationMetadata = applyPagination(
        structuredOutput,
        query.charOffset ?? 0,
        query.charLength
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
      structuredOutput,
      totalFiles,
      totalDirectories,
      totalSize,
      pagination,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...entryPaginationHints,
        ...getToolHints('LOCAL_VIEW_STRUCTURE', status),
        ...(paginationMetadata
          ? generatePaginationHints(paginationMetadata, {
              toolName: 'localViewStructure',
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
      hints: getToolHints('LOCAL_VIEW_STRUCTURE', 'error'),
    };
  }
}

async function parseLsSimple(
  output: string,
  basePath: string,
  showModified: boolean = false
): Promise<DirectoryEntry[]> {
  const lines = output.split('\n').filter(line => line.trim());

  const statPromises = lines.map(async name => {
    const fullPath = path.join(basePath, name);
    try {
      const stats = await fs.promises.lstat(fullPath);
      const entry: DirectoryEntry = {
        name,
        type: stats.isDirectory()
          ? ('directory' as const)
          : stats.isSymbolicLink()
            ? ('symlink' as const)
            : ('file' as const),
        size: formatFileSize(stats.size),
        extension: getExtension(name),
      };
      if (showModified) {
        entry.modified = stats.mtime.toISOString();
      }
      return entry;
    } catch {
      return {
        name,
        type: 'file' as const,
        extension: getExtension(name),
      };
    }
  });

  return await Promise.all(statPromises);
}

function parseLsLongFormat(
  output: string,
  showModified: boolean = false
): DirectoryEntry[] {
  const lines = output.split('\n').filter(line => line.trim());
  const entries: DirectoryEntry[] = [];

  for (const line of lines) {
    if (line.startsWith('total ')) continue;

    const match = line.match(
      /^([\w-]+[@+]?)\s+\d+\s+\w+\s+\w+\s+([\d.]+[KMGT]?)\s+(\w+\s+\d+\s+[\d:]+)\s+(.+)$/
    );

    if (match && match[1] && match[2] && match[3] && match[4]) {
      const permissions = match[1];
      const sizeStr = match[2];
      const modified = match[3];
      const name = match[4];

      let size = 0;
      if (/^\d+$/.test(sizeStr)) {
        size = parseInt(sizeStr, 10);
      } else {
        size = parseFileSize(sizeStr);
      }

      let type: 'file' | 'directory' | 'symlink' = 'file';
      if (permissions.startsWith('d')) type = 'directory';
      else if (permissions.startsWith('l')) type = 'symlink';

      const entry: DirectoryEntry = {
        name,
        type,
        size: formatFileSize(size),
        permissions,
        extension: getExtension(name),
      };
      if (showModified) {
        entry.modified = modified;
      }
      entries.push(entry);
    }
  }

  return entries;
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

  // Apply filters using consolidated filter logic
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

  if (
    !query.charLength &&
    filteredEntries.length > RESOURCE_LIMITS.MAX_ENTRIES_BEFORE_PAGINATION
  ) {
    const estimatedSize = filteredEntries.length * 150;
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
        `Recursive listing found ${filteredEntries.length} entries - too much to process at once`,
        'Options: Use charLength to paginate through the tree, or limit to reduce scope',
        'Alternative: Start with depth=1 to get overview, then drill into specific subdirectories',
        'Why this matters: Large trees overwhelm context and make it hard to find what you need',
      ],
    };
  }

  // Convert entries to string format with indentation based on path depth
  const structuredLines = filteredEntries.map(entry => {
    const depth = entry.name.split(path.sep).length - 1;
    return formatEntryString(entry, depth);
  });
  let structuredOutput = structuredLines.join('\n');

  let paginationMetadata: ReturnType<typeof applyPagination> | null = null;

  if (query.charLength) {
    paginationMetadata = applyPagination(
      structuredOutput,
      query.charOffset ?? 0,
      query.charLength
    );
    structuredOutput = paginationMetadata.paginatedContent;
  }

  const status = filteredEntries.length > 0 ? 'hasResults' : 'empty';
  const baseHints = getToolHints('LOCAL_VIEW_STRUCTURE', status);
  const paginationHints = paginationMetadata
    ? generatePaginationHints(paginationMetadata, {
        toolName: 'localViewStructure',
      })
    : [];

  return {
    status,
    path: query.path,
    structuredOutput,
    totalFiles,
    totalDirectories,
    totalSize,
    ...(paginationMetadata && {
      pagination: createPaginationInfo(paginationMetadata),
    }),
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: [...baseHints, ...paginationHints],
  };
}

async function walkDirectory(
  basePath: string,
  currentPath: string,
  depth: number,
  maxDepth: number,
  entries: DirectoryEntry[],
  maxEntries: number = 10000,
  showHidden: boolean = false,
  showModified: boolean = false
): Promise<void> {
  if (depth >= maxDepth) return;
  if (entries.length >= maxEntries) return;

  try {
    const items = await fs.promises.readdir(currentPath);

    for (const item of items) {
      // Skip hidden files if not requested
      if (!showHidden && item.startsWith('.')) continue;

      const fullPath = path.join(currentPath, item);
      const relativePath = path.relative(basePath, fullPath);

      try {
        const stats = await fs.promises.lstat(fullPath);

        let type: 'file' | 'directory' | 'symlink' = 'file';
        if (stats.isDirectory()) type = 'directory';
        else if (stats.isSymbolicLink()) type = 'symlink';

        const entry: DirectoryEntry = {
          name: relativePath,
          type,
          size: formatFileSize(stats.size),
          extension: getExtension(item),
        };
        if (showModified) {
          entry.modified = stats.mtime.toISOString();
        }
        entries.push(entry);

        if (type === 'directory') {
          await walkDirectory(
            basePath,
            fullPath,
            depth + 1,
            maxDepth,
            entries,
            maxEntries,
            showHidden,
            showModified
          );
        }
      } catch {
        // Skip inaccessible items
      }
    }
  } catch {
    // Skip unreadable directories
  }
}
