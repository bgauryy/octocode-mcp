import {
  IGNORED_FILE_PATTERNS,
  IGNORED_PATH_PATTERNS,
} from './patternsConstants.js';

/**
 * Checks if a path should be ignored
 * @param pathToCheck - The path to check (relative or absolute)
 * @returns true if the path should be ignored
 */
export function shouldIgnorePath(pathToCheck: string): boolean {
  if (!pathToCheck || pathToCheck.trim() === '') {
    return true;
  }

  // Normalize path separators
  const normalizedPath = pathToCheck.replace(/\\/g, '/');

  // Extract the last component for directory name checking
  const pathParts = normalizedPath.split('/');

  // Check each part of the path
  for (const part of pathParts) {
    if (IGNORED_PATH_PATTERNS.some(pattern => pattern.test(part))) {
      return true;
    }
  }

  // Check the full path
  if (IGNORED_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath))) {
    return true;
  }

  return false;
}

/**
 * Checks if a file should be ignored
 * @param fileName - The file name or full path to check
 * @returns true if the file should be ignored
 */
export function shouldIgnoreFile(fileName: string): boolean {
  if (!fileName || fileName.trim() === '') {
    return true;
  }

  // Normalize path separators
  const normalizedPath = fileName.replace(/\\/g, '/');

  // Extract just the filename
  const fileNameOnly = normalizedPath.split('/').pop() || '';

  // Check against file patterns
  if (IGNORED_FILE_PATTERNS.some(pattern => pattern.test(fileNameOnly))) {
    return true;
  }

  // Check against full path for files in specific directories (e.g., .ssh/)
  if (IGNORED_FILE_PATTERNS.some(pattern => pattern.test(normalizedPath))) {
    return true;
  }

  return false;
}

/**
 * Combined check for both path and file filtering
 * @param fullPath - The full path to check
 * @returns true if the path or file should be ignored
 */
export function shouldIgnore(fullPath: string): boolean {
  return shouldIgnorePath(fullPath) || shouldIgnoreFile(fullPath);
}
