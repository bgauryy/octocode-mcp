/**
 * File filtering utilities for common patterns
 */

/**
 * Gets file extension from a path
 */
export function getExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}
