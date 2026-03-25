import { IGNORED_PATH_PATTERNS } from './pathPatterns.js';
import { IGNORED_FILE_PATTERNS } from './filePatterns.js';
import { securityRegistry } from './registry.js';

function getPathPatterns(): RegExp[] {
  const extra = securityRegistry.extraIgnoredPathPatterns;
  return extra.length > 0
    ? [...IGNORED_PATH_PATTERNS, ...extra]
    : IGNORED_PATH_PATTERNS;
}

function getFilePatterns(): RegExp[] {
  const extra = securityRegistry.extraIgnoredFilePatterns;
  return extra.length > 0
    ? [...IGNORED_FILE_PATTERNS, ...extra]
    : IGNORED_FILE_PATTERNS;
}

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

  const pathPatterns = getPathPatterns();

  // Check each part of the path
  for (const part of pathParts) {
    if (pathPatterns.some(pattern => pattern.test(part))) {
      return true;
    }
  }

  // Check the full path
  if (pathPatterns.some(pattern => pattern.test(normalizedPath))) {
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

  const filePatterns = getFilePatterns();

  // Check against file patterns
  if (filePatterns.some(pattern => pattern.test(fileNameOnly))) {
    return true;
  }

  // Check against full path for files in specific directories (e.g., .ssh/)
  if (filePatterns.some(pattern => pattern.test(normalizedPath))) {
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
