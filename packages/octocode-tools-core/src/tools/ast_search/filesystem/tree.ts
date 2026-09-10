import { computeEffectiveExcludeDirs } from './defaults.js';
import { formatFileSize, parseFileSize } from '../../../utils/file/size.js';
import { AST_SEARCH_TOOL_NAME } from '@octocodeai/octocode-core/schema';
import {
  validateToolPath,
  createErrorResult,
} from '../../../utils/file/toolHelpers.js';
import type { AstFilesystemTreeToolResult } from '@octocodeai/octocode-core/extra-types';
import type { AstSearchQuery } from '@octocodeai/octocode-core/schema';
import { ToolErrors } from '../../../errors/errorFactories.js';
import {
  applyEntryFilters,
  toEntryObject,
  toGroupedLists,
  type DirectoryEntry,
} from './filters.js';
import {
  buildWalkWarnings,
  paginateEntries,
  summarizeEntries,
} from './response.js';
import {
  LOCAL_MAX_LIMIT,
  MAX_PAGE_NUMBER,
} from '@octocodeai/octocode-core/schema';
import { attachRawResponseChars } from '../../../utils/response/charSavings.js';
import { contextUtils } from '../../../utils/contextUtils.js';
import type { FileSystemEntry } from '@octocodeai/octocode-engine';
import { buildNextPageContinuation } from '../../../scheme/pagination.js';
import { buildTreeNextMap } from './treeNext.js';

type FilesystemTreeQuery = Extract<
  AstSearchQuery,
  { operation: 'tree'; treeKind: 'filesystem' }
>;

export async function viewFilesystemTree(
  query: FilesystemTreeQuery
): Promise<AstFilesystemTreeToolResult> {
  try {
    const pathValidation = validateToolPath(query, AST_SEARCH_TOOL_NAME);
    if (!pathValidation.isValid) {
      return pathValidation.errorResult as AstFilesystemTreeToolResult;
    }

    const effectiveShowModified =
      query.detail === 'modified' ||
      query.detail === 'full' ||
      query.sort === 'time';

    return await viewFilesystemTreeNative(
      query,
      pathValidation.sanitizedPath,
      effectiveShowModified
    );
  } catch (error) {
    const toolError = ToolErrors.toolExecutionFailed(
      AST_SEARCH_TOOL_NAME,
      error instanceof Error ? error : undefined
    );
    return {
      status: 'error',
      error: toolError.message,
      errorCode: toolError.errorCode,
    };
  }
}

async function viewFilesystemTreeNative(
  query: FilesystemTreeQuery,
  basePath: string,
  showModified: boolean = false
): Promise<AstFilesystemTreeToolResult> {
  const recursiveMode = Boolean(query.maxDepth);
  const maxDepth = query.maxDepth || 1;
  const nativeNamePatterns = nativeNamePatternsFromQuery(query);
  const hasPostNativeFilter = hasPostNativeFilters(query, nativeNamePatterns);
  const maxEntries =
    recursiveMode && hasPostNativeFilter ? LOCAL_MAX_LIMIT : 10000;
  const excludeDir = computeEffectiveExcludeDirs(basePath, query.excludeDir);

  let nativeResult: Awaited<ReturnType<typeof contextUtils.queryFileSystem>>;
  try {
    nativeResult = await contextUtils.queryFileSystem({
      path: basePath,
      recursive: recursiveMode,
      includeRoot: false,
      showHidden: query.hidden ?? false,
      maxDepth,
      names: nativeNamePatterns,
      extensions: query.extensions,
      entryType: query.entryType,
      excludeDir,
      limit: maxEntries,
    });
  } catch (error) {
    return createNativeAccessErrorResult(error, query, basePath);
  }

  const entries = nativeResult.entries.map(entry =>
    nativeEntryToDirectoryEntry(entry, showModified, query.detail === 'full')
  );

  let filteredEntries = applyEntryFilters(entries, query);

  const sortBy = query.sort ?? 'name';
  filteredEntries = filteredEntries.sort((a, b) => {
    let comparison: number;
    switch (sortBy) {
      case 'size': {
        const aSize = a.sizeBytes ?? (a.size ? parseFileSize(a.size) : 0);
        const bSize = b.sizeBytes ?? (b.size ? parseFileSize(b.size) : 0);
        comparison = aSize - bSize;
        break;
      }
      case 'time':
        if (showModified && a.modified && b.modified) {
          comparison = a.modified.localeCompare(b.modified);
        } else {
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

  const availableBeforeLimit = filteredEntries.length;
  if (query.limit) {
    filteredEntries = filteredEntries.slice(0, query.limit);
  }
  const limitTruncated = filteredEntries.length < availableBeforeLimit;
  const scanTruncated = nativeResult.wasCapped;

  const totalEntries = filteredEntries.length;
  const { paginatedEntries, pagination } = paginateEntries(
    filteredEntries,
    query
  );
  const richEntries = query.detail === 'full' || query.detail === 'modified';
  const entryPayload = richEntries
    ? {
        path: basePath,
        entries: paginatedEntries.map(entry => ({
          ...toEntryObject(entry),
          path: entry.path ?? `${basePath.replace(/\/$/, '')}/${entry.name}`,
        })),
      }
    : { path: basePath, ...toGroupedLists(paginatedEntries) };
  const warnings = [
    ...nativeResult.warnings,
    ...buildWalkWarnings({
      skipped: nativeResult.skipped,
      permissionDenied: nativeResult.permissionDenied,
    }),
    ...(nativeResult.wasCapped
      ? [
          `Results capped at ${maxEntries} entries during the walk before sorting — sort:"${sortBy}" only orders that partial set, not the true top-N across the whole tree. Add namePattern/extensions/entryType/excludeDir or reduce depth to narrow the scope.`,
        ]
      : []),
    ...(pagination.outOfRange
      ? [
          `page:${query.page} is out of range (only ${pagination.totalPages} page(s), ${pagination.totalEntries} total entries) — returned page ${pagination.currentPage} instead.`,
        ]
      : []),
  ];
  const isEmpty = totalEntries === 0;
  const summary = summarizeEntries(filteredEntries);

  // Per-result evidence hints (read the first file / descend into the first
  // subdirectory) plus the pagination continuation when there are more pages.
  const rowNext = buildTreeNextMap(paginatedEntries) ?? {};
  const requestedLimit = query.limit ?? LOCAL_MAX_LIMIT;
  const canExpandLimit = limitTruncated && requestedLimit < LOCAL_MAX_LIMIT;
  const terminalLimit =
    (pagination.hasMore && pagination.currentPage >= MAX_PAGE_NUMBER) ||
    ((limitTruncated || scanTruncated) && !canExpandLimit);
  const next: Record<string, unknown> = {
    ...rowNext,
    ...(pagination.hasMore && !terminalLimit
      ? {
          nextPage: buildNextPageContinuation(
            AST_SEARCH_TOOL_NAME,
            {
              ...query,
              page: pagination.currentPage + 1,
            } as Record<string, unknown>,
            'Continue to the next page of directory entries.'
          ),
        }
      : {}),
    ...(canExpandLimit
      ? {
          expandLimit: buildNextPageContinuation(
            AST_SEARCH_TOOL_NAME,
            {
              ...query,
              limit: Math.min(
                LOCAL_MAX_LIMIT,
                Math.max(requestedLimit + 1, requestedLimit * 2)
              ),
              page: 1,
            } as Record<string, unknown>,
            'Re-run with a larger entry limit because directory entries remain.'
          ),
        }
      : {}),
  };

  return attachRawResponseChars(
    {
      ...(isEmpty ? { status: 'empty' as const } : {}),
      ...entryPayload,
      summary,
      ...(pagination.hasMore ||
      pagination.totalPages > 1 ||
      pagination.outOfRange
        ? { pagination }
        : {}),
      ...(Object.keys(next).length > 0 ? { next } : {}),
      ...(terminalLimit ? { terminalLimit: true } : {}),
      ...(limitTruncated || scanTruncated
        ? {
            truncated: true,
            partialReasons: [
              ...(limitTruncated ? ['limit' as const] : []),
              ...(scanTruncated ? ['walkLimit' as const] : []),
            ],
            totalAvailable: Math.max(
              nativeResult.totalDiscovered,
              availableBeforeLimit
            ),
          }
        : {}),
      ...(warnings.length > 0 && { warnings }),
    },
    nativeResult.entries.reduce((sum, entry) => sum + entry.path.length, 0)
  );
}

function hasPostNativeFilters(
  query: FilesystemTreeQuery,
  nativeNamePatterns: string[] | undefined
): boolean {
  const pattern = query.namePattern;
  return Boolean(pattern && !nativeNamePatterns);
}

function nativeNamePatternsFromQuery(
  query: FilesystemTreeQuery
): string[] | undefined {
  const pattern = query.namePattern;
  if (!pattern) return undefined;

  if (pattern.includes('[')) return undefined;
  return pattern.includes('*') || pattern.includes('?')
    ? [pattern]
    : [`*${pattern}*`];
}

function nativeEntryToDirectoryEntry(
  entry: FileSystemEntry,
  showModified: boolean,
  showDetails: boolean
): DirectoryEntry {
  const type =
    entry.entryType === 'directory'
      ? 'directory'
      : entry.entryType === 'symlink'
        ? 'symlink'
        : 'file';
  const result: DirectoryEntry = {
    name: entry.relativePath || entry.name,
    path: entry.path,
    type,
    ...(entry.size !== undefined
      ? { size: formatFileSize(entry.size), sizeBytes: entry.size }
      : {}),
    ...(entry.extension ? { extension: entry.extension } : {}),
    depth: entry.depth,
  };
  if ((showDetails || showModified) && entry.modifiedMs !== undefined) {
    result.modified = new Date(entry.modifiedMs).toISOString();
  }
  if (showDetails && entry.permissions) {
    result.permissions = octalToSymbolicPermissions(entry.permissions);
  }
  return result;
}

function octalToSymbolicPermissions(octal: string): string {
  const value = Number.parseInt(octal, 8);
  if (!Number.isFinite(value)) return octal;
  const chars = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  return `${chars[(value >> 6) & 7]}${chars[(value >> 3) & 7]}${chars[value & 7]}`;
}

function createNativeAccessErrorResult(
  error: unknown,
  query: FilesystemTreeQuery,
  basePath: string
): AstFilesystemTreeToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const isNotFound = /ENOENT|not found|no such file/i.test(message);
  const isPermission = /EACCES|permission denied/i.test(message);
  const isNotDirectory = /ENOTDIR|not a directory/i.test(message);
  const toolError = ToolErrors.pathValidationFailed(
    basePath,
    isNotFound
      ? `Directory not found: ${basePath}`
      : isPermission
        ? `Permission denied: ${basePath}`
        : isNotDirectory
          ? `Not a directory: ${basePath}`
          : `Cannot access path: ${basePath}`
  );
  return createErrorResult(toolError, query, {
    toolName: AST_SEARCH_TOOL_NAME,
  }) as AstFilesystemTreeToolResult;
}
