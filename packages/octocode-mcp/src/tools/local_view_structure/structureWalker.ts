import fs from 'fs';
import path from 'path';
import { getExtension } from '../../utils/file/filters.js';
import { formatFileSize } from '../../utils/file/size.js';
import type { DirectoryEntry } from './structureFilters.js';

export interface WalkStats {
  skipped: number;
}

/**
 * Format Unix file mode bits as rwx permission string (e.g. "rw-r--r--")
 */
function formatPermissions(mode: number): string {
  const chars = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  const owner = chars[(mode >> 6) & 7]!;
  const group = chars[(mode >> 3) & 7]!;
  const other = chars[mode & 7]!;
  return `${owner}${group}${other}`;
}

export async function walkDirectory(
  basePath: string,
  currentPath: string,
  depth: number,
  maxDepth: number,
  entries: DirectoryEntry[],
  maxEntries: number = 10000,
  showHidden: boolean = false,
  showModified: boolean = false,
  stats?: WalkStats,
  showDetails: boolean = false
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
        const fileStats = await fs.promises.lstat(fullPath);

        let type: 'file' | 'directory' | 'symlink' = 'file';
        if (fileStats.isDirectory()) type = 'directory';
        else if (fileStats.isSymbolicLink()) type = 'symlink';

        const entry: DirectoryEntry = {
          name: relativePath,
          type,
          size: formatFileSize(fileStats.size),
          extension: getExtension(item),
          depth: depth, // Store correct depth from walker
        };
        if (showDetails || showModified) {
          entry.modified = fileStats.mtime.toISOString();
        }
        if (showDetails) {
          entry.permissions = formatPermissions(fileStats.mode);
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
            showModified,
            stats,
            showDetails
          );
        }
      } catch {
        if (stats) stats.skipped++;
      }
    }
  } catch {
    if (stats) stats.skipped++;
  }
}
