/**
 * Platform Detection & Utilities
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ============================================================================
// Git/VCS Directory Detection
// ============================================================================

/**
 * Known Git/VCS directories
 * Using Set for O(1) lookup performance
 */
const GIT_DIRS = new Set(['.git', '.svn', '.hg', '.bzr']);

/**
 * Known IDE/Editor directories
 */
const IDE_DIRS = new Set([
  '.vscode', // VS Code
  '.idea', // JetBrains (IntelliJ, WebStorm, PyCharm, etc.)
  '.vs', // Visual Studio
  '.eclipse', // Eclipse
  '.vscode-test', // VS Code test runner
]);

/**
 * Check if a path segment is git/VCS related
 * @param pathToCheck - Path to check (can be full path or just directory name)
 * @returns true if the path is git/VCS related
 */
export function isGitRelated(pathToCheck: string): boolean {
  const basename = path.basename(pathToCheck);
  return GIT_DIRS.has(basename);
}

/**
 * Check if a path segment is IDE related
 * @param pathToCheck - Path to check (can be full path or just directory name)
 * @returns true if the path is IDE related
 */
export function isIDERelated(pathToCheck: string): boolean {
  const basename = path.basename(pathToCheck);
  return IDE_DIRS.has(basename);
}

/**
 * Check if a path is inside a git repository by walking up the directory tree
 * Handles both regular repos and git worktrees (where .git can be a file)
 * @param directory - Starting directory to check from
 * @returns true if inside a git repository
 */
export function isInsideGitRepo(directory: string): boolean {
  try {
    let currentDir = path.resolve(directory);
    let parentDir = path.dirname(currentDir);

    // Walk up the directory tree until we reach the root
    while (currentDir !== parentDir) {
      const gitPath = path.join(currentDir, '.git');
      // Check if .git exists (either as directory or file for worktrees)
      if (fs.existsSync(gitPath)) {
        return true;
      }
      currentDir = parentDir;
      parentDir = path.dirname(currentDir);
    }

    // Check root directory as well
    if (fs.existsSync(path.join(currentDir, '.git'))) {
      return true;
    }

    return false;
  } catch {
    // If any filesystem error occurs, assume not in a git repo
    return false;
  }
}

/**
 * Find the git repository root directory
 * @param directory - Starting directory to search from
 * @returns The git repository root path, or null if not in a git repository
 */
export function findGitRoot(directory: string): string | null {
  try {
    let currentDir = path.resolve(directory);
    let parentDir = path.dirname(currentDir);

    // Walk up the directory tree until we reach the root
    while (currentDir !== parentDir) {
      if (fs.existsSync(path.join(currentDir, '.git'))) {
        return currentDir;
      }
      currentDir = parentDir;
      parentDir = path.dirname(currentDir);
    }

    // Check root directory as well
    if (fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Combined check for IDE or Git/VCS paths
 * @param pathToCheck - Path to check
 * @returns true if the path is IDE or Git/VCS related
 */
export function isIDEOrGitPath(pathToCheck: string): boolean {
  return isIDERelated(pathToCheck) || isGitRelated(pathToCheck);
}

// ============================================================================
// Platform Detection
// ============================================================================

// Platform detection
export const isWindows: boolean = os.platform() === 'win32';
export const isMac: boolean = os.platform() === 'darwin';
export const isLinux: boolean = os.platform() === 'linux';
export const HOME: string = os.homedir();

/**
 * Get the AppData path on Windows
 */
export function getAppDataPath(): string {
  if (isWindows) {
    return process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
  }
  return HOME;
}

/**
 * Get the local AppData path on Windows
 */
export function getLocalAppDataPath(): string {
  if (isWindows) {
    return process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
  }
  return HOME;
}

/**
 * Clear the terminal screen and scrollback buffer
 *
 * Uses ANSI escape sequences for comprehensive clearing:
 * - \x1b[2J: Clear entire visible screen
 * - \x1b[3J: Clear scrollback buffer (supported by most modern terminals)
 * - \x1b[H: Move cursor to home position (top-left)
 *
 * @see https://github.com/sindresorhus/ansi-escapes
 */
export function clearScreen(): void {
  // Clear visible screen + scrollback buffer + move cursor to home
  const clearSequence = '\x1b[2J\x1b[3J\x1b[H';
  process.stdout.write(clearSequence);
}

/**
 * Get platform name for display
 */
export function getPlatformName(): string {
  if (isMac) return 'macOS';
  if (isWindows) return 'Windows';
  if (isLinux) return 'Linux';
  return os.platform();
}

/**
 * Get architecture for display
 */
export function getArchitecture(): string {
  return os.arch();
}
