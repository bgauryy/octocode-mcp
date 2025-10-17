/**
 * local_view_structure tool - ls-based directory exploration
 */

import { LsCommandBuilder } from '../commands/LsCommandBuilder.js';
import { safeExec } from '../utils/exec.js';
import { pathValidator } from '../security/pathValidator.js';
import { getExtension } from '../utils/fileFilters.js';
import { getToolHints } from './hints.js';
import type {
  ViewStructureQuery,
  ViewStructureResult,
  DirectoryEntry,
} from '../types.js';
import fs from 'fs';
import path from 'path';

/**
 * Executes a view structure query using ls
 */
export async function viewStructure(
  query: ViewStructureQuery
): Promise<ViewStructureResult> {
  try {
    // Validate path
    const pathValidation = pathValidator.validate(query.path);
    if (!pathValidation.isValid) {
      return {
        status: 'error',
        error: pathValidation.error,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_VIEW_STRUCTURE', 'error'),
      };
    }

    // For tree view or recursive with depth, use custom implementation
    if (query.treeView || query.depth) {
      return await viewStructureRecursive(query, pathValidation.sanitizedPath!);
    }

    // Build ls command
    const builder = new LsCommandBuilder();
    const { command, args } = builder.fromQuery(query).build();

    // Execute command
    const result = await safeExec(command, args);

    if (!result.success) {
      return {
        status: 'error',
        error: result.stderr || 'Failed to list directory',
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: getToolHints('LOCAL_VIEW_STRUCTURE', 'error'),
      };
    }

    // Parse results
    const entries = query.details
      ? parseLsLongFormat(result.stdout)
      : parseLsSimple(result.stdout, pathValidation.sanitizedPath!);

    // Apply filters
    let filteredEntries = entries;

    if (query.pattern) {
      filteredEntries = filteredEntries.filter((e) =>
        e.name.includes(query.pattern!)
      );
    }

    if (query.extension) {
      filteredEntries = filteredEntries.filter(
        (e) => e.extension === query.extension
      );
    }

    if (query.extensions && query.extensions.length > 0) {
      filteredEntries = filteredEntries.filter(
        (e) => e.extension && query.extensions!.includes(e.extension)
      );
    }

    if (query.directoriesOnly) {
      filteredEntries = filteredEntries.filter((e) => e.type === 'directory');
    }

    if (query.filesOnly) {
      filteredEntries = filteredEntries.filter((e) => e.type === 'file');
    }

    // Apply limit
    if (query.limit) {
      filteredEntries = filteredEntries.slice(0, query.limit);
    }

    // Calculate totals
    const totalFiles = filteredEntries.filter((e) => e.type === 'file').length;
    const totalDirectories = filteredEntries.filter(
      (e) => e.type === 'directory'
    ).length;
    const totalSize = filteredEntries.reduce(
      (sum, e) => sum + (e.size || 0),
      0
    );

    const status = entries.length > 0 ? 'hasResults' : 'empty';
    return {
      status,
      path: query.path,
      entries: filteredEntries,
      totalFiles,
      totalDirectories,
      totalSize,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_VIEW_STRUCTURE', status),
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_VIEW_STRUCTURE', 'error'),
    };
  }
}

/**
 * Parses simple ls output (just names)
 */
function parseLsSimple(output: string, basePath: string): DirectoryEntry[] {
  const lines = output.split('\n').filter((line) => line.trim());
  const entries: DirectoryEntry[] = [];

  for (const name of lines) {
    const fullPath = path.join(basePath, name);
    let type: 'file' | 'directory' | 'symlink' = 'file';

    try {
      const stats = fs.lstatSync(fullPath);
      if (stats.isDirectory()) type = 'directory';
      else if (stats.isSymbolicLink()) type = 'symlink';
    } catch {
      // Ignore errors
    }

    entries.push({
      name,
      type,
      extension: getExtension(name),
    });
  }

  return entries;
}

/**
 * Parses ls -l output (detailed format)
 */
function parseLsLongFormat(output: string): DirectoryEntry[] {
  const lines = output.split('\n').filter((line) => line.trim());
  const entries: DirectoryEntry[] = [];

  for (const line of lines) {
    // Skip total line
    if (line.startsWith('total ')) continue;

    // Parse ls -l format: permissions links owner group size date time name
    // Size can be numeric (123456) or human-readable (1.5M, 192K) when -h flag is used
    const match = line.match(
      /^([\w-]+)\s+\d+\s+\w+\s+\w+\s+([\d.]+[KMGT]?)\s+(\w+\s+\d+\s+[\d:]+)\s+(.+)$/
    );

    if (match) {
      const [, permissions, sizeStr, modified, name] = match;

      // Parse size (handle both numeric and human-readable formats)
      let size = 0;
      if (/^\d+$/.test(sizeStr)) {
        // Pure numeric size
        size = parseInt(sizeStr, 10);
      } else {
        // Human-readable size (e.g., 1.5M, 192K)
        size = parseHumanSize(sizeStr);
      }

      let type: 'file' | 'directory' | 'symlink' = 'file';
      if (permissions.startsWith('d')) type = 'directory';
      else if (permissions.startsWith('l')) type = 'symlink';

      entries.push({
        name,
        type,
        size,
        humanSize: formatSize(size),
        modified,
        permissions,
        extension: getExtension(name),
      });
    }
  }

  return entries;
}

/**
 * Parses human-readable size string to bytes
 */
function parseHumanSize(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)([KMGT]?)$/);
  if (!match) return 0;

  const [, numStr, unit] = match;
  const num = parseFloat(numStr);

  switch (unit) {
    case 'K':
      return Math.round(num * 1024);
    case 'M':
      return Math.round(num * 1024 * 1024);
    case 'G':
      return Math.round(num * 1024 * 1024 * 1024);
    case 'T':
      return Math.round(num * 1024 * 1024 * 1024 * 1024);
    default:
      return Math.round(num);
  }
}

/**
 * Recursive directory structure view
 */
async function viewStructureRecursive(
  query: ViewStructureQuery,
  basePath: string
): Promise<ViewStructureResult> {
  const entries: DirectoryEntry[] = [];
  const maxDepth = query.depth || 2;

  await walkDirectory(basePath, basePath, 0, maxDepth, entries);

  const status = entries.length > 0 ? 'hasResults' : 'empty';
  return {
    status,
    path: query.path,
    entries: query.limit ? entries.slice(0, query.limit) : entries,
    totalFiles: entries.filter((e) => e.type === 'file').length,
    totalDirectories: entries.filter((e) => e.type === 'directory').length,
    totalSize: entries.reduce((sum, e) => sum + (e.size || 0), 0),
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: getToolHints('LOCAL_VIEW_STRUCTURE', status),
  };
}

/**
 * Recursively walks a directory
 */
async function walkDirectory(
  basePath: string,
  currentPath: string,
  depth: number,
  maxDepth: number,
  entries: DirectoryEntry[]
): Promise<void> {
  if (depth >= maxDepth) return;

  try {
    const items = await fs.promises.readdir(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const relativePath = path.relative(basePath, fullPath);

      try {
        const stats = await fs.promises.lstat(fullPath);

        let type: 'file' | 'directory' | 'symlink' = 'file';
        if (stats.isDirectory()) type = 'directory';
        else if (stats.isSymbolicLink()) type = 'symlink';

        entries.push({
          name: relativePath,
          type,
          size: stats.size,
          humanSize: formatSize(stats.size),
          modified: stats.mtime.toISOString(),
          extension: getExtension(item),
        });

        // Recurse into directories
        if (type === 'directory') {
          await walkDirectory(basePath, fullPath, depth + 1, maxDepth, entries);
        }
      } catch {
        // Skip items we can't access
      }
    }
  } catch {
    // Skip directories we can't read
  }
}

/**
 * Formats file size to human-readable format
 */
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)}${units[unitIndex]}`;
}
