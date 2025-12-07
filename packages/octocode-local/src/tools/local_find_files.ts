import { FindCommandBuilder } from '../commands/FindCommandBuilder.js';
import { safeExec } from '../utils/exec.js';
import { getToolHints } from './hints.js';
import {
  generatePaginationHints,
  type PaginationMetadata,
} from '../utils/pagination.js';
import {
  validateToolPath,
  createErrorResult,
  checkLargeOutputSafety,
} from '../utils/toolHelpers.js';
import type { FindFilesQuery, FindFilesResult, FoundFile } from '../types.js';
import fs from 'fs';
import { ToolErrors } from '../errors/errorCodes.js';

export async function findFiles(
  query: FindFilesQuery
): Promise<FindFilesResult> {
  try {
    const validation = validateToolPath(query, 'LOCAL_FIND_FILES');
    if (!validation.isValid) {
      return validation.errorResult as FindFilesResult;
    }

    const builder = new FindCommandBuilder();
    const { command, args } = builder.fromQuery(query).build();

    const result = await safeExec(command, args);
    if (!result.success) {
      const toolError = ToolErrors.commandExecutionFailed(
        'find',
        new Error(result.stderr)
      );
      return createErrorResult(
        toolError,
        'LOCAL_FIND_FILES',
        query
      ) as FindFilesResult;
    }

    let filePaths = result.stdout
      .split('\0')
      .filter((line) => line.trim())
      .map((line) => line.trim());

    const maxFiles = query.limit || 1000;
    filePaths = filePaths.slice(0, maxFiles);

    const files: FoundFile[] = await getFileDetails(
      filePaths,
      query.showFileLastModified
    );

    files.sort((a, b) => {
      if (query.showFileLastModified && a.modified && b.modified) {
        return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      }
      return a.path.localeCompare(b.path);
    });

    const filesForOutput: FoundFile[] = files.map((f) => {
      const result: FoundFile = {
        path: f.path,
        type: f.type,
      };
      if (query.details) {
        if (f.size !== undefined) result.size = f.size;
        if (f.permissions) result.permissions = f.permissions;
      }
      if (query.showFileLastModified && f.modified) {
        result.modified = f.modified;
      }
      return result;
    });

    const totalFiles = filesForOutput.length;
    const filesPerPage = query.filesPerPage || 20;
    const filePageNumber = query.filePageNumber || 1;
    const totalPages = Math.ceil(totalFiles / filesPerPage);
    const startIdx = (filePageNumber - 1) * filesPerPage;
    const endIdx = Math.min(startIdx + filesPerPage, totalFiles);

    const paginatedFiles = filesForOutput.slice(startIdx, endIdx);

    const safetyCheck = checkLargeOutputSafety(
      paginatedFiles.length,
      !!query.charLength,
      {
        threshold: 100,
        itemType: 'file',
        detailed: query.details,
      }
    );

    if (safetyCheck.shouldBlock) {
      return {
        status: 'error',
        errorCode: safetyCheck.errorCode!,
        totalFiles,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: safetyCheck.hints!,
      };
    }

    let finalFiles = paginatedFiles;
    let paginationMetadata: PaginationMetadata | null = null;

    if (query.charLength) {
      // Respect charLength by fitting as many files as possible from the current page
      // without breaking JSON structure.
      const fittedFiles: FoundFile[] = [];
      let currentSize = 2; // Starting []

      for (const file of paginatedFiles) {
        // +1 for comma (approximation)
        const fileSize = JSON.stringify(file).length + 1;
        if (
          currentSize + fileSize > query.charLength &&
          fittedFiles.length > 0
        ) {
          break;
        }
        fittedFiles.push(file);
        currentSize += fileSize;
      }

      finalFiles = fittedFiles;

      // We construct metadata to reflect that we applied a char limit
      paginationMetadata = {
        paginatedContent: JSON.stringify(finalFiles),
        charOffset: 0,
        charLength: currentSize,
        totalChars: JSON.stringify(paginatedFiles).length, // approximate for this page
        hasMore:
          finalFiles.length < paginatedFiles.length ||
          filePageNumber < totalPages,
        estimatedTokens: Math.ceil(currentSize / 4),
        currentPage: filePageNumber,
        totalPages: totalPages,
      };
    }

    const status = totalFiles > 0 ? 'hasResults' : 'empty';

    const filePaginationHints = [
      `Page ${filePageNumber}/${totalPages} (showing ${finalFiles.length} of ${totalFiles})`,
      filePageNumber < totalPages
        ? `Next: filePageNumber=${filePageNumber + 1}`
        : 'Final page',
      query.showFileLastModified
        ? 'Sorted by modification time (most recent first)'
        : 'Sorted by path',
    ];

    return {
      status,
      files: finalFiles,
      totalFiles,
      pagination: {
        currentPage: filePageNumber,
        totalPages,
        filesPerPage,
        totalFiles,
        hasMore: filePageNumber < totalPages,
      },
      ...(paginationMetadata && {
        charPagination: {
          currentPage: paginationMetadata.currentPage,
          totalPages: paginationMetadata.totalPages,
          charOffset: paginationMetadata.charOffset,
          charLength: paginationMetadata.charLength,
          totalChars: paginationMetadata.totalChars,
          hasMore: paginationMetadata.hasMore,
        },
      }),
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: [
        ...filePaginationHints,
        ...getToolHints('LOCAL_FIND_FILES', status),
        ...(paginationMetadata
          ? generatePaginationHints(paginationMetadata, {
              toolName: 'local_find_files',
            })
          : []),
      ],
    };
  } catch (error) {
    return createErrorResult(
      error,
      'LOCAL_FIND_FILES',
      query
    ) as FindFilesResult;
  }
}

async function getFileDetails(
  filePaths: string[],
  showModified: boolean = false
): Promise<FoundFile[]> {
  const CONCURRENCY_LIMIT = 24;
  const results: FoundFile[] = new Array(filePaths.length);

  const processAtIndex = async (index: number) => {
    const filePath = filePaths[index];
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
