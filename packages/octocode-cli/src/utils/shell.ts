/**
 * Shell Command Utilities
 */

import { spawnSync } from 'node:child_process';

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Safely run a command with arguments (no shell injection risk)
 * @param command - The command to run (e.g., 'npm', 'gh')
 * @param args - Array of arguments
 * @returns CommandResult with stdout, stderr, and exit code
 */
export function runCommand(
  command: string,
  args: string[] = []
): CommandResult {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      timeout: 30000, // 30s timeout
    });

    return {
      success: result.status === 0,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || '',
      exitCode: result.status,
    };
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error',
      exitCode: null,
    };
  }
}

/**
 * Check if a command exists on the system
 * @param command - The command to check
 * @returns true if the command exists
 */
export function commandExists(command: string): boolean {
  const checkCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = runCommand(checkCommand, [command]);
  return result.success;
}

/**
 * Get the version of a command
 * @param command - The command to check
 * @param versionFlag - The flag to get version (default: --version)
 * @returns Version string or null if not found
 */
export function getCommandVersion(
  command: string,
  versionFlag: string = '--version'
): string | null {
  const result = runCommand(command, [versionFlag]);
  if (result.success) {
    return result.stdout.split('\n')[0];
  }
  return null;
}
