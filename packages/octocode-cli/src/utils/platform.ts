/**
 * Platform Detection & Utilities
 *
 * Re-exports platform utilities from octocode-shared, plus CLI-specific functions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Re-export platform detection from shared package
export {
  isWindows,
  isMac,
  isLinux,
  HOME,
  getAppDataPath,
  getLocalAppDataPath,
  getPlatformName,
  getArchitecture,
} from 'octocode-shared';

import { isWindows, isMac } from 'octocode-shared';

// ============================================================================
// Git/VCS Directory Detection (CLI-specific)
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
// CLI-Specific Platform Functions
// ============================================================================

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
 * Open a file in the default application or specified editor
 * @param filePath - Path to the file to open
 * @param editor - Optional editor command (e.g., 'code', 'cursor', 'vim')
 * @returns true if successful, false otherwise
 */
export function openFile(filePath: string, editor?: string): boolean {
  try {
    let command: string;
    let args: string[];

    if (editor) {
      // Use specified editor
      command = editor;
      args = [filePath];
    } else if (isMac) {
      // macOS: use 'open' command
      command = 'open';
      args = [filePath];
    } else if (isWindows) {
      // Windows: use 'start' command via cmd
      command = 'cmd';
      args = ['/c', 'start', '""', filePath];
    } else {
      // Linux: use 'xdg-open'
      command = 'xdg-open';
      args = [filePath];
    }

    const result = spawnSync(command, args, {
      stdio: 'ignore',
      shell: isWindows && !editor,
    });

    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Open a file in a specific IDE
 * @param filePath - Path to the file to open
 * @param ide - IDE to use ('cursor', 'vscode', 'default')
 * @returns true if successful, false otherwise
 */
export function openInEditor(
  filePath: string,
  ide: 'cursor' | 'vscode' | 'default'
): boolean {
  switch (ide) {
    case 'cursor':
      return openFile(filePath, 'cursor');
    case 'vscode':
      return openFile(filePath, 'code');
    case 'default':
    default:
      return openFile(filePath);
  }
}
