import type { ViewStructureQuery } from '../../utils/core/types.js';

/**
 * Internal directory entry for processing
 */
export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size?: string;
  modified?: string;
  permissions?: string;
  extension?: string;
  depth?: number;
}

/**
 * Apply query filters to entry list
 * Used by both CLI and recursive paths to ensure consistent filtering
 */
export function applyEntryFilters(
  entries: DirectoryEntry[],
  query: ViewStructureQuery
): DirectoryEntry[] {
  let filtered = entries;

  if (query.pattern) {
    const pattern = query.pattern;

    const isGlob =
      pattern.includes('*') || pattern.includes('?') || pattern.includes('[');

    if (isGlob) {
      // First escape regex metacharacters INCLUDING glob characters (* and ?)
      // so they can be converted to regex patterns in the next step
      let regexPattern = pattern.replace(/[.+^${}()|[\]\\*?]/g, '\\$&');

      // Convert escaped glob characters to regex equivalents
      regexPattern = regexPattern
        .replace(/\\\*/g, '.*')
        .replace(/\\\?/g, '.')
        .replace(/\\\[!/g, '[^')
        .replace(/\\\[/g, '[')
        .replace(/\\\]/g, ']');

      try {
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        filtered = filtered.filter(e => {
          // For recursive mode, entry.name is the relative path (e.g., "subdir/file.ts")
          // Pattern should match the filename part only for consistency
          const filename = e.name.includes('/')
            ? e.name.split('/').pop()!
            : e.name;
          return regex.test(filename);
        });
      } catch {
        filtered = filtered.filter(e => {
          const filename = e.name.includes('/')
            ? e.name.split('/').pop()!
            : e.name;
          return filename.includes(pattern);
        });
      }
    } else {
      filtered = filtered.filter(e => {
        // For recursive mode, entry.name is the relative path (e.g., "subdir/file.ts")
        // Pattern should match the filename part only for consistency
        const filename = e.name.includes('/')
          ? e.name.split('/').pop()!
          : e.name;
        return filename.includes(pattern);
      });
    }
  }

  if (query.extension) {
    filtered = filtered.filter(e => e.extension === query.extension);
  }

  if (query.extensions && query.extensions.length > 0) {
    const extensions = query.extensions;
    filtered = filtered.filter(
      e => e.extension && extensions.includes(e.extension)
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
export function formatEntryString(
  entry: DirectoryEntry,
  indent: number = 0
): string {
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
