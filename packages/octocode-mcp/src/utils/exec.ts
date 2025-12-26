/**
 * npm and gh CLI execution utilities
 * Uses shared base module for spawn functionality
 */

import { dirname, join } from 'path';
import {
  spawnWithTimeout,
  spawnCheckSuccess,
  spawnCollectStdout,
  validateArgs,
} from './exec/base.js';

/**
 * Get the npm binary path by looking next to the current node binary.
 * This ensures npm is found even when PATH doesn't include it.
 * On Windows, npm is a batch script (npm.cmd), not a binary.
 */
function getNpmPath(): string {
  const nodeDir = dirname(process.execPath);
  const npmBinary = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return join(nodeDir, npmBinary);
}

/**
 * Get GitHub CLI authentication token
 * @returns Promise resolving to token string or null if not authenticated
 */
export async function getGithubCLIToken(): Promise<string | null> {
  return spawnCollectStdout('gh', ['auth', 'token'], 10000);
}

const ALLOWED_NPM_COMMANDS = [
  'view',
  'search',
  'ping',
  'config',
  'whoami',
] as const;

type NpmCommand = (typeof ALLOWED_NPM_COMMANDS)[number];

type NpmExecOptions = {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
};

interface NpmExecResult {
  stdout: string;
  stderr: string;
  error?: Error;
  exitCode?: number;
}

/**
 * Check if npm CLI is available by running `npm --version`
 * @param timeoutMs - Timeout in milliseconds (default 10000ms)
 * @returns true if npm CLI is installed and accessible, false otherwise
 */
export async function checkNpmAvailability(
  timeoutMs: number = 10000
): Promise<boolean> {
  return spawnCheckSuccess(getNpmPath(), ['--version'], timeoutMs);
}

/**
 * Execute NPM command with security validation using spawn (safer than exec)
 */
export async function executeNpmCommand(
  command: NpmCommand,
  args: string[],
  options: NpmExecOptions = {}
): Promise<NpmExecResult> {
  if (!ALLOWED_NPM_COMMANDS.includes(command)) {
    return {
      stdout: '',
      stderr: '',
      error: new Error(`Command '${command}' is not allowed`),
    };
  }

  const validation = validateArgs(args);
  if (!validation.valid) {
    return {
      stdout: '',
      stderr: '',
      error: new Error(`Invalid arguments: ${validation.error}`),
    };
  }

  const { timeout = 30000, cwd, env } = options;

  const result = await spawnWithTimeout(getNpmPath(), [command, ...args], {
    timeout,
    cwd,
    env,
    removeEnvVars: ['NODE_OPTIONS', 'NPM_CONFIG_SCRIPT_SHELL'],
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? undefined,
    error: result.error,
  };
}
