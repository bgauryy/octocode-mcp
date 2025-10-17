/**
 * local_find_files tool - find-based advanced file discovery
 */

import { FindCommandBuilder } from '../commands/FindCommandBuilder.js';
import { GrepCommandBuilder } from '../commands/GrepCommandBuilder.js';
import { safeExec } from '../utils/exec.js';
import { pathValidator } from '../security/pathValidator.js';
import { getToolHints } from './hints.js';
import type { FindFilesQuery, FindFilesResult, FoundFile } from '../types.js';
import fs from 'fs';

/**
 * Executes a find files query using the find command
 */
export async function findFiles(
  query: FindFilesQuery
): Promise<FindFilesResult> {
  try {
    // Validate path
    const pathValidation = pathValidator.validate(query.path);
    if (!pathValidation.isValid) {
      return {
        status: 'error',
        error: pathValidation.error,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_FIND_FILES', 'error'),
      };
    }

    // Build find command
    const builder = new FindCommandBuilder();
    const { command, args } = builder.fromQuery(query).build();

    // Execute command
    const result = await safeExec(command, args);

    if (!result.success) {
      return {
        status: 'error',
        error: result.stderr || 'Find command failed',
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_FIND_FILES', 'error'),
      };
    }

    // Parse file paths
    let filePaths = result.stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.trim());

    // Filter by content pattern if requested
    if (query.containsPattern) {
      filePaths = await filterByContent(filePaths, query.containsPattern);
    }

    // Apply limit
    if (query.limit) {
      filePaths = filePaths.slice(0, query.limit);
    }

    // Get file details if requested
    const files: FoundFile[] = query.details
      ? await getFileDetails(filePaths)
      : filePaths.map((p) => ({ path: p, type: 'file' }));

    const status = files.length > 0 ? 'hasResults' : 'empty';
    return {
      status,
      files,
      totalFiles: files.length,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_FIND_FILES', status),
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_FIND_FILES', 'error'),
    };
  }
}

/**
 * Filters file paths by content using grep
 */
async function filterByContent(
  filePaths: string[],
  pattern: string
): Promise<string[]> {
  const matchingFiles: string[] = [];

  for (const filePath of filePaths) {
    try {
      const builder = new GrepCommandBuilder();
      const { command, args } = builder
        .simple(pattern, filePath)
        .filesOnly()
        .build();

      const result = await safeExec(command, args);

      if (result.success && result.stdout.trim()) {
        matchingFiles.push(filePath);
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return matchingFiles;
}

/**
 * Gets detailed information about files
 */
async function getFileDetails(filePaths: string[]): Promise<FoundFile[]> {
  const files: FoundFile[] = [];

  for (const filePath of filePaths) {
    try {
      const stats = await fs.promises.lstat(filePath);

      let type = 'file';
      if (stats.isDirectory()) type = 'directory';
      else if (stats.isSymbolicLink()) type = 'symlink';

      files.push({
        path: filePath,
        type,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        permissions: stats.mode.toString(8).slice(-3),
      });
    } catch {
      // If we can't get details, add basic info
      files.push({
        path: filePath,
        type: 'file',
      });
    }
  }

  return files;
}
