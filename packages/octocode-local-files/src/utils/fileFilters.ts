/**
 * File filtering utilities for common patterns
 */

import { DEFAULT_EXCLUDE_PATTERNS } from '../constants.js';

/**
 * Checks if a file path should be excluded based on common patterns
 */
export function shouldExclude(
  filePath: string,
  excludePatterns?: string[]
): boolean {
  const patterns = excludePatterns || DEFAULT_EXCLUDE_PATTERNS;

  for (const pattern of patterns) {
    if (filePath.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Filters an array of file paths based on exclude patterns
 */
export function filterFiles(
  files: string[],
  excludePatterns?: string[]
): string[] {
  return files.filter((file) => !shouldExclude(file, excludePatterns));
}

/**
 * Checks if a file matches an include pattern
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  // Simple glob pattern matching
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  const fileName = filePath.split('/').pop() || '';

  return regex.test(fileName);
}

/**
 * Checks if a file matches any of the include patterns
 */
export function matchesAnyPattern(
  filePath: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => matchesPattern(filePath, pattern));
}

/**
 * Gets file extension from a path
 */
export function getExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/**
 * Filters files by extension
 */
export function filterByExtension(
  files: string[],
  extension: string
): string[] {
  return files.filter((file) => getExtension(file) === extension);
}
