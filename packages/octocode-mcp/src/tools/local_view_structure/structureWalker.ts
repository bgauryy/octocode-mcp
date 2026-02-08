import fs from 'fs';
import path from 'path';
import { getExtension } from '../../utils/file/filters.js';
import { formatFileSize } from '../../utils/file/size.js';
import type { DirectoryEntry } from './structureFilters.js';

export async function walkDirectory(
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
          depth: depth, // Store correct depth from walker
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
