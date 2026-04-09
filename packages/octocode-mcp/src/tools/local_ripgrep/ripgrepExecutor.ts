import { RipgrepCommandBuilder } from '../../commands/RipgrepCommandBuilder.js';
import {
  GrepCommandBuilder,
  getGrepFeatureWarnings,
} from '../../commands/GrepCommandBuilder.js';
import { safeExec } from '../../utils/exec/safe.js';
import { getLargeFileWorkflowHints } from '../../hints/dynamic.js';
import {
  validateRipgrepQuery,
  type RipgrepQuery,
} from '@octocodeai/octocode-core';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { RESOURCE_LIMITS } from '../../utils/core/constants.js';
import { TOOL_NAMES } from '../toolMetadata/proxies.js';
import type { LocalSearchCodeToolResult } from '@octocodeai/octocode-core';
import { promises as fs } from 'fs';
import { join } from 'path';
import { LOCAL_TOOL_ERROR_CODES } from '../../errors/localToolErrors.js';
import { getHints } from '../../hints/index.js';
import { parseRipgrepOutput } from './ripgrepParser.js';
import { parseGrepOutputWrapper } from './ripgrepParser.js';
import { buildSearchResult } from './ripgrepResultBuilder.js';

/**
 * Execute search using ripgrep (rg) - preferred engine
 */
export async function executeRipgrepSearchInternal(
  configuredQuery: RipgrepQuery
): Promise<LocalSearchCodeToolResult> {
  const validation = validateRipgrepQuery(configuredQuery);
  if (!validation.isValid) {
    return createErrorResult(
      new Error(`Query validation failed: ${validation.errors.join(', ')}`),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
        extra: { warnings: validation.warnings },
      }
    ) as LocalSearchCodeToolResult;
  }

  if (!configuredQuery.path) {
    return createErrorResult(
      new Error('Path is required for search'),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
        extra: { warnings: validation.warnings },
      }
    ) as LocalSearchCodeToolResult;
  }
  const queryWithPath = configuredQuery as RipgrepQuery & { path: string };
  const pathValidation = validateToolPath(
    queryWithPath,
    TOOL_NAMES.LOCAL_RIPGREP
  );
  if (!pathValidation.isValid) {
    return pathValidation.errorResult as LocalSearchCodeToolResult;
  }

  const queryForExec = {
    ...configuredQuery,
    path: pathValidation.sanitizedPath!,
  };

  const dirStats = await estimateDirectoryStats(queryForExec.path);
  const chunkingWarnings: string[] = [];

  if (dirStats.isLarge && !queryForExec.filesOnly) {
    chunkingWarnings.push(
      `Large directory detected (~${Math.round(dirStats.estimatedSizeMB)}MB, ~${dirStats.estimatedFileCount} files). Consider chunking workflow for better performance.`
    );
    chunkingWarnings.push(...getLargeFileWorkflowHints('search'));
  }

  const builder = new RipgrepCommandBuilder();
  const { command, args } = builder.fromQuery(queryForExec).build();

  const result = await safeExec(command, args);

  if (result.stderr?.includes('timeout') || result.code === null) {
    const timeoutMs = RESOURCE_LIMITS.DEFAULT_EXEC_TIMEOUT_MS;
    return {
      status: 'error',
      error: `Search timed out after ${timeoutMs / 1000} seconds.`,
      errorCode: LOCAL_TOOL_ERROR_CODES.COMMAND_TIMEOUT,
      searchEngine: 'rg',
      hints: [
        `Search timed out after ${timeoutMs / 1000} seconds.`,
        'Try a more specific path or add type/include filters to narrow the search.',
        'Use filesOnly=true for faster discovery.',
        'Consider excluding large directories with excludeDir.',
        ...chunkingWarnings,
      ],
    } as LocalSearchCodeToolResult;
  }

  if (result.code === 1 || (result.success && !result.stdout.trim())) {
    return {
      status: 'empty',
      searchEngine: 'rg',
      warnings: [...validation.warnings, ...chunkingWarnings],
      hints: getHints(TOOL_NAMES.LOCAL_RIPGREP, 'empty'),
    };
  }

  if (!result.success) {
    return createErrorResult(
      new Error(`Ripgrep failed (exit code ${result.code}): ${result.stderr}`),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
      }
    ) as LocalSearchCodeToolResult;
  }

  const parsed = parseRipgrepOutput(result.stdout, configuredQuery);

  return await buildSearchResult(
    parsed.files,
    configuredQuery,
    'rg',
    [...validation.warnings, ...chunkingWarnings],
    parsed.stats
  );
}

/**
 * Execute search using grep (fallback when ripgrep not available)
 */
export async function executeGrepSearch(
  configuredQuery: RipgrepQuery
): Promise<LocalSearchCodeToolResult> {
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
    ) as LocalSearchCodeToolResult;
  }

  if (!configuredQuery.path) {
    return createErrorResult(
      new Error('Path is required for search'),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
        extra: { warnings: [...grepWarnings, ...validation.warnings] },
      }
    ) as LocalSearchCodeToolResult;
  }
  const queryWithPath = configuredQuery as RipgrepQuery & { path: string };

  const pathValidation = validateToolPath(
    queryWithPath,
    TOOL_NAMES.LOCAL_RIPGREP
  );
  if (!pathValidation.isValid) {
    return pathValidation.errorResult as LocalSearchCodeToolResult;
  }

  const queryForExec = {
    ...configuredQuery,
    path: pathValidation.sanitizedPath!,
  };

  const dirStats = await estimateDirectoryStats(queryForExec.path);
  const chunkingWarnings: string[] = [];

  if (dirStats.isLarge && !queryForExec.filesOnly) {
    chunkingWarnings.push(
      `Large directory detected (~${Math.round(dirStats.estimatedSizeMB)}MB, ~${dirStats.estimatedFileCount} files). Consider chunking workflow for better performance.`
    );
    chunkingWarnings.push(...getLargeFileWorkflowHints('search'));
  }

  const builder = new GrepCommandBuilder();
  const { command, args } = builder.fromQuery(queryForExec).build();

  const result = await safeExec(command, args);

  if (result.stderr?.includes('timeout') || result.code === null) {
    const timeoutMs = RESOURCE_LIMITS.DEFAULT_EXEC_TIMEOUT_MS;
    return {
      status: 'error',
      error: `Search timed out after ${timeoutMs / 1000} seconds.`,
      errorCode: LOCAL_TOOL_ERROR_CODES.COMMAND_TIMEOUT,
      searchEngine: 'grep',
      hints: [
        `Search timed out after ${timeoutMs / 1000} seconds.`,
        'Try a more specific path or add type/include filters to narrow the search.',
        'Use filesOnly=true for faster discovery.',
        'Consider excluding large directories with excludeDir.',
        ...chunkingWarnings,
      ],
    } as LocalSearchCodeToolResult;
  }

  if (result.code === 1 || (result.success && !result.stdout.trim())) {
    return {
      status: 'empty',
      searchEngine: 'grep',
      warnings: [...grepWarnings, ...validation.warnings, ...chunkingWarnings],
      hints: getHints(TOOL_NAMES.LOCAL_RIPGREP, 'empty'),
    };
  }

  if (!result.success) {
    return createErrorResult(
      new Error(`Grep failed (exit code ${result.code}): ${result.stderr}`),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
      }
    ) as LocalSearchCodeToolResult;
  }

  const parsedFiles = parseGrepOutputWrapper(result.stdout, configuredQuery);

  return await buildSearchResult(parsedFiles, configuredQuery, 'grep', [
    ...grepWarnings,
    ...validation.warnings,
    ...chunkingWarnings,
  ]);
}

export async function estimateDirectoryStats(dirPath: string): Promise<{
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
          // stat failed for one entry; omit from size estimate.
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
          // Subdirectory read failed; omit from estimate.
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
