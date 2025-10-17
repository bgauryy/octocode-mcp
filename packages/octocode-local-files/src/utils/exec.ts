/**
 * Safe command execution wrapper with security validation
 */

import { spawn } from 'child_process';
import { validateCommand } from '../security/commandValidator.js';
import { DEFAULTS } from '../constants.js';
import type { ExecOptions, ExecResult } from '../types.js';

/**
 * Safely executes a command with validation and resource limits
 */
export async function safeExec(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  // Validate command and arguments
  const validation = validateCommand(command, args);
  if (!validation.isValid) {
    throw new Error(`Command validation failed: ${validation.error}`);
  }

  const timeout = options.timeout || DEFAULTS.COMMAND_TIMEOUT;
  const maxOutputSize = options.maxOutputSize || DEFAULTS.MAX_OUTPUT_SIZE;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Handle stdout
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Prevent memory exhaustion
      if (stdout.length > maxOutputSize) {
        killed = true;
        child.kill();
        reject(
          new Error(`Output size limit exceeded (${maxOutputSize} bytes)`)
        );
      }
    });

    // Handle stderr
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > maxOutputSize) {
        killed = true;
        child.kill();
        reject(
          new Error(`Error output size limit exceeded (${maxOutputSize} bytes)`)
        );
      }
    });

    // Handle errors
    child.on('error', (error) => {
      if (!killed) {
        reject(error);
      }
    });

    // Handle completion
    child.on('close', (code) => {
      if (!killed) {
        resolve({
          code,
          stdout,
          stderr,
          success: code === 0,
        });
      }
    });

    // Handle timeout
    setTimeout(() => {
      if (child.exitCode === null) {
        killed = true;
        child.kill();
        reject(new Error(`Command timeout after ${timeout}ms`));
      }
    }, timeout);
  });
}

/**
 * Executes a command and returns only stdout or throws on error
 */
export async function execSimple(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<string> {
  const result = await safeExec(command, args, options);

  if (!result.success) {
    throw new Error(
      `Command failed with code ${result.code}: ${result.stderr}`
    );
  }

  return result.stdout;
}
