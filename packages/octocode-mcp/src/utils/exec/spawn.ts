/**
 * Core spawn utilities for command execution
 * Provides common patterns for timeout handling, output collection, and process management
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';

/**
 * Base options for spawn-with-timeout operations
 */
export interface SpawnWithTimeoutOptions {
  /** Command timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Working directory */
  cwd?: string;
  /** Environment variables to merge with process.env */
  env?: Record<string, string | undefined>;
  /** Maximum output size in bytes before killing process (default: unlimited) */
  maxOutputSize?: number;
  /** Environment variables to explicitly remove */
  removeEnvVars?: string[];
}

/**
 * Result from spawn-with-timeout execution
 */
export interface SpawnResult {
  /** Collected stdout */
  stdout: string;
  /** Collected stderr */
  stderr: string;
  /** Exit code (null if process was killed) */
  exitCode: number | null;
  /** Whether the process completed successfully (exit code 0) */
  success: boolean;
  /** Error if spawn failed or process was killed */
  error?: Error;
  /** Whether the process was killed due to timeout */
  timedOut?: boolean;
  /** Whether the process was killed due to output size limit */
  outputLimitExceeded?: boolean;
}

/**
 * Internal state for tracking process execution
 */
interface ProcessState {
  killed: boolean;
  stdout: string;
  stderr: string;
  totalOutputSize: number;
}

/**
 * Spawn a command with timeout and output collection
 * This is the core shared functionality used by both npm/gh execution and local safe execution
 *
 * @param command - The command to spawn
 * @param args - Command arguments
 * @param options - Spawn options including timeout and output limits
 * @returns Promise resolving to SpawnResult
 */
export function spawnWithTimeout(
  command: string,
  args: string[],
  options: SpawnWithTimeoutOptions = {}
): Promise<SpawnResult> {
  const {
    timeout = 30000,
    cwd,
    env = {},
    maxOutputSize,
    removeEnvVars = ['NODE_OPTIONS'],
  } = options;

  return new Promise(resolve => {
    const state: ProcessState = {
      killed: false,
      stdout: '',
      stderr: '',
      totalOutputSize: 0,
    };

    // Build environment with removals
    const processEnv: Record<string, string | undefined> = {
      ...process.env,
      ...env,
    };

    // Remove specified env vars
    for (const key of removeEnvVars) {
      processEnv[key] = undefined;
    }

    // Spawn options
    const spawnOptions: SpawnOptions = {
      cwd,
      env: processEnv as typeof process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    };

    let childProcess: ChildProcess;

    try {
      childProcess = spawn(command, args, spawnOptions);
    } catch (error) {
      resolve({
        stdout: '',
        stderr: '',
        exitCode: null,
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error(`Failed to spawn command '${command}'`),
      });
      return;
    }

    // Timeout handling with manual kill
    const timeoutHandle = setTimeout(() => {
      if (!state.killed) {
        state.killed = true;
        childProcess.kill('SIGTERM');
        resolve({
          stdout: state.stdout,
          stderr: state.stderr,
          exitCode: null,
          success: false,
          error: new Error(`Command timeout after ${timeout}ms`),
          timedOut: true,
        });
      }
    }, timeout);

    // Helper to check and handle output size limit
    const checkOutputLimit = (): boolean => {
      if (maxOutputSize && state.totalOutputSize > maxOutputSize) {
        if (!state.killed) {
          state.killed = true;
          childProcess.kill('SIGKILL');
          clearTimeout(timeoutHandle);
          resolve({
            stdout: state.stdout,
            stderr: state.stderr,
            exitCode: null,
            success: false,
            error: new Error('Output size limit exceeded'),
            outputLimitExceeded: true,
          });
        }
        return true;
      }
      return false;
    };

    // Collect stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      if (state.killed) return;

      const chunk = data.toString();
      state.totalOutputSize += Buffer.byteLength(chunk);

      if (checkOutputLimit()) return;

      state.stdout += chunk;
    });

    // Collect stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      if (state.killed) return;

      const chunk = data.toString();
      state.totalOutputSize += Buffer.byteLength(chunk);

      if (checkOutputLimit()) return;

      state.stderr += chunk;
    });

    // Handle process close
    childProcess.on('close', code => {
      if (state.killed) return;

      clearTimeout(timeoutHandle);

      resolve({
        stdout: state.stdout,
        stderr: state.stderr,
        exitCode: code,
        success: code === 0,
      });
    });

    // Handle spawn errors
    childProcess.on('error', error => {
      if (state.killed) return;

      state.killed = true;
      clearTimeout(timeoutHandle);

      resolve({
        stdout: state.stdout,
        stderr: state.stderr,
        exitCode: null,
        success: false,
        error,
      });
    });
  });
}

/**
 * Simple spawn that resolves to boolean success (for availability checks)
 * Used for quick command availability verification
 *
 * @param command - The command to check
 * @param args - Command arguments
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Promise resolving to true if command exits with code 0
 */
export function spawnCheckSuccess(
  command: string,
  args: string[],
  timeoutMs: number = 10000
): Promise<boolean> {
  return new Promise(resolve => {
    let killed = false;

    const childProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: {
        ...process.env,
        NODE_OPTIONS: undefined,
      },
    });

    childProcess.on('close', code => {
      if (!killed) {
        resolve(code === 0);
      }
    });

    childProcess.on('error', () => {
      if (!killed) {
        resolve(false);
      }
    });

    const timeoutHandle = setTimeout(() => {
      if (!killed) {
        killed = true;
        childProcess.kill('SIGTERM');
        resolve(false);
      }
    }, timeoutMs);

    childProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}

/**
 * Simple spawn that collects stdout and resolves to trimmed string or null
 * Used for commands like `gh auth token` that return a single value
 *
 * @param command - The command to run
 * @param args - Command arguments
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Promise resolving to trimmed stdout or null on failure/empty
 */
export function spawnCollectStdout(
  command: string,
  args: string[],
  timeoutMs: number = 10000
): Promise<string | null> {
  return new Promise(resolve => {
    let killed = false;
    let stdout = '';

    const childProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: {
        ...process.env,
        NODE_OPTIONS: undefined,
      },
    });

    childProcess.stdout?.on('data', data => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', () => {
      // Ignore stderr
    });

    childProcess.on('close', code => {
      if (!killed) {
        if (code === 0) {
          const trimmed = stdout.trim();
          resolve(trimmed || null);
        } else {
          resolve(null);
        }
      }
    });

    childProcess.on('error', () => {
      if (!killed) {
        resolve(null);
      }
    });

    const timeoutHandle = setTimeout(() => {
      if (!killed) {
        killed = true;
        childProcess.kill('SIGTERM');
        resolve(null);
      }
    }, timeoutMs);

    childProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}

/**
 * Validate command arguments for common security issues
 * @param args - Arguments to validate
 * @param maxLength - Maximum allowed length for each argument (default: 1000)
 * @returns Validation result with error message if invalid
 */
export function validateArgs(
  args: string[],
  maxLength: number = 1000
): { valid: boolean; error?: string } {
  for (const arg of args) {
    if (arg.includes('\0')) {
      return { valid: false, error: 'Null bytes not allowed in arguments' };
    }

    if (arg.length > maxLength) {
      return { valid: false, error: 'Argument too long' };
    }
  }

  return { valid: true };
}
