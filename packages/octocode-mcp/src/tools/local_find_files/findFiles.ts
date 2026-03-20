import { FindCommandBuilder } from '../../commands/FindCommandBuilder.js';
import { safeExec } from '../../utils/exec/safe.js';
import {
  checkCommandAvailability,
  getMissingCommandError,
} from '../../utils/exec/commandAvailability.js';
import { getHints } from '../../hints/index.js';
import { generatePaginationHints } from '../../utils/pagination/hints.js';
import {
  serializeForPagination,
  createPaginationInfo,
} from '../../utils/pagination/core.js';
import type { PaginationMetadata } from '../../utils/pagination/types.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { formatFileSize } from '../../utils/file/size.js';
import type {
  FindFilesQuery,
  FindFilesResult,
  FoundFile,
} from '../../utils/core/types.js';
import fs from 'fs';
import { ToolErrors } from '../../errors/errorFactories.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';

export async function findFiles(
  query: FindFilesQuery
): Promise<FindFilesResult> {
  const details = query.details ?? true;
  const showLastModified = query.showFileLastModified ?? true;

  try {
    const findAvailability = await checkCommandAvailability('find');
    if (!findAvailability.available) {
      const toolError = ToolErrors.commandNotAvailable(
        'find',
        getMissingCommandError('find')
      );
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FIND_FILES,
      }) as FindFilesResult;
    }

    const validation = validateToolPath(query, TOOL_NAMES.LOCAL_FIND_FILES);
    if (!validation.isValid) {
      return validation.errorResult as FindFilesResult;
    }

    const queryWithSanitizedPath = {
      ...query,
      path: validation.sanitizedPath!,
    };

    const DEFAULT_EXCLUDE_DIRS = [
      'node_modules',
      'dist',
      '.git',
      'coverage',
      'build',
      '.next',
    ];
    const queryWithDefaults = {
      ...queryWithSanitizedPath,
      excludeDir: queryWithSanitizedPath.excludeDir ?? DEFAULT_EXCLUDE_DIRS,
    };

    const builder = new FindCommandBuilder();
    const { command, args } = builder.fromQuery(queryWithDefaults).build();

    const result = await safeExec(command, args);

    if (!result.success) {
      const stderrMsg = result.stderr?.trim();
      const userMessage =
        stderrMsg?.replace(/^find:\s*/i, '').trim() ||
        'File search operation failed';
      const toolError = ToolErrors.commandExecutionFailed(
        'find',
        new Error(userMessage),
        userMessage
      );
      return createErrorResult(toolError, query, {
        toolName: TOOL_NAMES.LOCAL_FIND_FILES,
        extra: { stderr: userMessage },
      }) as FindFilesResult;
    }

    let filePaths = result.stdout
      .split('\0')
      .filter(line => line.trim())
      .map(line => line.trim());

    const maxFiles = query.limit || 1000;
    filePaths = filePaths.slice(0, maxFiles);

    const files: FoundFile[] = await getFileDetails(
      filePaths,
      showLastModified
    );

    if (details) {
      await Promise.all(
        files.map(async file => {
          if (
            file.size === undefined ||
            !file.permissions ||
            (showLastModified && !file.modified)
          ) {
            try {
              const stats = await fs.promises.lstat(file.path);
              if (file.size === undefined) file.size = stats.size;
              if (!file.permissions) {
                file.permissions = stats.mode.toString(8).slice(-3);
              }
              if (showLastModified && !file.modified) {
                file.modified = stats.mtime.toISOString();
              }
            } catch {
              // lstat failed for one file; leave metadata partial.
            }
          }
        })
      );
    }

    const sortBy = query.sortBy || 'modified';
    sortFoundFiles(files, sortBy, showLastModified);

    const filesForOutput = formatForOutput(files, details, showLastModified);
    const totalFiles = filesForOutput.length;

    const filesPerPage = query.filesPerPage || 20;
    const filePageNumber = query.filePageNumber || 1;
    const totalPages = Math.ceil(totalFiles / filesPerPage);
    const startIdx = (filePageNumber - 1) * filesPerPage;
    const endIdx = Math.min(startIdx + filesPerPage, totalFiles);
    const paginatedFiles = filesForOutput.slice(startIdx, endIdx);

    const { finalFiles, paginationMetadata } = applyCharPagination(
      paginatedFiles,
      query.charOffset,
      query.charLength
    );

    const status = totalFiles > 0 ? 'hasResults' : 'empty';
    const configFilePatterns =
      /\.(config|rc|env|json|ya?ml|toml|ini)$|^(\..*rc|config\.|\.env)/i;
    const hasConfigFiles = finalFiles.some(f =>
      configFilePatterns.test(f.path.split('/').pop() || '')
    );

    return {
      status,
      files: finalFiles,
      pagination: {
        currentPage: filePageNumber,
        totalPages,
        filesPerPage,
        totalFiles,
        hasMore: filePageNumber < totalPages,
      },
      ...(paginationMetadata && {
        charPagination: createPaginationInfo(paginationMetadata),
      }),
      hints: [
        `Page ${filePageNumber}/${totalPages} (showing ${finalFiles.length} of ${totalFiles})`,
        filePageNumber < totalPages
          ? `Next: filePageNumber=${filePageNumber + 1}`
          : 'Final page',
        `Sorted by ${sortBy}${sortBy === 'modified' ? ' (most recent first)' : sortBy === 'size' ? ' (largest first)' : ''}`,
        ...getHints(TOOL_NAMES.LOCAL_FIND_FILES, status, {
          fileCount: totalFiles,
          hasConfigFiles,
        }),
        ...(paginationMetadata
          ? generatePaginationHints(paginationMetadata, {
              toolName: TOOL_NAMES.LOCAL_FIND_FILES,
            })
          : []),
      ],
    };
  } catch (error) {
    return createErrorResult(error, query, {
      toolName: TOOL_NAMES.LOCAL_FIND_FILES,
    }) as FindFilesResult;
  }
}

function sortFoundFiles(
  files: FoundFile[],
  sortBy: string,
  showLastModified: boolean
): void {
  files.sort((a, b) => {
    switch (sortBy) {
      case 'size':
        return (b.size ?? 0) - (a.size ?? 0);
      case 'name':
        return (a.path.split('/').pop() || '').localeCompare(
          b.path.split('/').pop() || ''
        );
      case 'path':
        return a.path.localeCompare(b.path);
      case 'modified':
      default:
        if (showLastModified && a.modified && b.modified) {
          return (
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
          );
        }
        return a.path.localeCompare(b.path);
    }
  });
}

function formatForOutput(
  files: FoundFile[],
  details: boolean,
  showLastModified: boolean
): FoundFile[] {
  return files.map(f => {
    const result: FoundFile = { path: f.path, type: f.type };
    if (details) {
      if (f.size !== undefined) {
        result.size = f.size;
        result.sizeFormatted = formatFileSize(f.size);
      }
      if (f.permissions) result.permissions = f.permissions;
    }
    if (showLastModified && f.modified) {
      result.modified = f.modified;
    }
    return result;
  });
}

function applyCharPagination(
  paginatedFiles: FoundFile[],
  charOffset?: number,
  charLength?: number
): { finalFiles: FoundFile[]; paginationMetadata: PaginationMetadata | null } {
  if (!charLength) {
    return { finalFiles: paginatedFiles, paginationMetadata: null };
  }

  const fullJson = serializeForPagination(paginatedFiles, false);
  const totalChars = fullJson.length;
  const startOffset = charOffset ?? 0;
  const targetLength = charLength;
  const endLimit = startOffset + targetLength;

  if (startOffset >= totalChars) {
    return {
      finalFiles: [],
      paginationMetadata: {
        paginatedContent: '[]',
        byteOffset: startOffset,
        byteLength: 0,
        totalBytes: totalChars,
        charOffset: startOffset,
        charLength: 0,
        totalChars,
        hasMore: false,
        estimatedTokens: 0,
        currentPage: Math.floor(startOffset / targetLength) + 1,
        totalPages: Math.ceil(totalChars / targetLength),
      },
    };
  }

  const selectedFiles: FoundFile[] = [];
  let currentPos = 1;

  for (let i = 0; i < paginatedFiles.length; i++) {
    const itemLen = JSON.stringify(paginatedFiles[i]).length;
    const itemStart = currentPos;
    const itemEnd = itemStart + itemLen;

    if (itemStart < endLimit && itemEnd > startOffset) {
      selectedFiles.push(paginatedFiles[i]!);
    }
    currentPos += itemLen + 1;
    if (currentPos >= endLimit) break;
  }

  const finalJson = serializeForPagination(selectedFiles, false);
  const hasMore = currentPos < totalChars;

  return {
    finalFiles: selectedFiles,
    paginationMetadata: {
      paginatedContent: finalJson,
      byteOffset: startOffset,
      byteLength: finalJson.length,
      totalBytes: totalChars,
      charOffset: startOffset,
      charLength: finalJson.length,
      totalChars,
      hasMore,
      nextCharOffset: hasMore ? currentPos : undefined,
      estimatedTokens: Math.ceil(finalJson.length / 4),
      currentPage: Math.floor(startOffset / targetLength) + 1,
      totalPages: Math.ceil(totalChars / targetLength),
    },
  };
}

async function getFileDetails(
  filePaths: string[],
  showModified: boolean = false
): Promise<FoundFile[]> {
  const CONCURRENCY_LIMIT = 24;

  const results: FoundFile[] = new Array(filePaths.length);

  const processAtIndex = async (index: number) => {
    const filePath = filePaths[index]!;
    try {
      const stats = await fs.promises.lstat(filePath);

      let type: 'file' | 'directory' | 'symlink' = 'file';
      if (stats.isDirectory()) type = 'directory';
      else if (stats.isSymbolicLink()) type = 'symlink';

      const file: FoundFile = {
        path: filePath,
        type,
        size: stats.size,
        permissions: stats.mode.toString(8).slice(-3),
      };
      if (showModified) {
        file.modified = stats.mtime.toISOString();
      }
      results[index] = file;
    } catch {
      results[index] = {
        path: filePath,
        type: 'file',
      };
    }
  };

  let nextIndex = 0;
  const getNext = () => {
    const current = nextIndex;
    nextIndex += 1;
    return current < filePaths.length ? current : -1;
  };
  const worker = async () => {
    for (let i = getNext(); i !== -1; i = getNext()) {
      await processAtIndex(i);
    }
  };

  const workers = Array.from(
    { length: Math.min(CONCURRENCY_LIMIT, filePaths.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
