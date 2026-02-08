import { RipgrepCommandBuilder } from '../../commands/RipgrepCommandBuilder.js';
import {
  GrepCommandBuilder,
  getGrepFeatureWarnings,
} from '../../commands/GrepCommandBuilder.js';
import { safeExec } from '../../utils/exec/index.js';
import { getLargeFileWorkflowHints } from '../../hints/index.js';
import { validateRipgrepQuery, type RipgrepQuery } from './scheme.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../utils/file/toolHelpers.js';
import { RESOURCE_LIMITS } from '../../utils/core/constants.js';
import { TOOL_NAMES } from '../toolMetadata.js';
import type { SearchContentResult } from '../../utils/core/types.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { LOCAL_TOOL_ERROR_CODES } from '../../errorCodes.js';
import { getHints } from '../../hints/index.js';
import { parseRipgrepOutput } from './ripgrepParser.js';
import { parseGrepOutputWrapper } from './ripgrepParser.js';
import { buildSearchResult } from './ripgrepResultBuilder.js';

/**
 * Execute search using ripgrep (rg) - preferred engine
 */
export async function executeRipgrepSearchInternal(
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

  // Type guard: ensure path exists before validation
  if (!configuredQuery.path) {
    return createErrorResult(
      new Error('Path is required for search'),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
        extra: { warnings: validation.warnings },
      }
    ) as SearchContentResult;
  }
  const queryWithPath = configuredQuery as RipgrepQuery & { path: string };
  const pathValidation = validateToolPath(
    queryWithPath,
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
      errorCode: LOCAL_TOOL_ERROR_CODES.COMMAND_TIMEOUT,
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

  // Handle both JSON and plain text output modes
  // filesOnly (-l) and filesWithoutMatch (--files-without-match) output plain text
  const parsed = parseRipgrepOutput(result.stdout, configuredQuery);

  return buildSearchResult(
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

  // Type guard: ensure path exists before validation
  if (!configuredQuery.path) {
    return createErrorResult(
      new Error('Path is required for search'),
      configuredQuery,
      {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
        extra: { warnings: [...grepWarnings, ...validation.warnings] },
      }
    ) as SearchContentResult;
  }
  const queryWithPath = configuredQuery as RipgrepQuery & { path: string };

  const pathValidation = validateToolPath(
    queryWithPath,
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
      errorCode: LOCAL_TOOL_ERROR_CODES.COMMAND_TIMEOUT,
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
  const parsedFiles = parseGrepOutputWrapper(result.stdout, configuredQuery);

  return buildSearchResult(parsedFiles, configuredQuery, 'grep', [
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
