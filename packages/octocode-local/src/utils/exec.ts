/**
 * Safe command execution wrapper with security validation
 */

import { spawn } from 'child_process';
import { validateCommand } from '../security/commandValidator.js';
import { validateExecutionContext } from '../security/executionContextValidator.js';
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
  const validation = validateCommand(command, args);
  if (!validation.isValid) {
    throw new Error(`Command validation failed: ${validation.error}`);
  }

  const contextValidation = validateExecutionContext(options.cwd);
  if (!contextValidation.isValid) {
    throw new Error(
      `Execution context validation failed: ${contextValidation.error}`
    );
  }

  const timeout = options.timeout || DEFAULTS.COMMAND_TIMEOUT;
  const maxOutputSize = options.maxOutputSize || DEFAULTS.MAX_OUTPUT_SIZE;

  return new Promise((resolve, reject) => {
    const cleanup = () => {};

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > maxOutputSize) {
        killed = true;
        child.kill();
        cleanup();
        reject(
          new Error(`Output size limit exceeded (${maxOutputSize} bytes)`)
        );
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > maxOutputSize) {
        killed = true;
        child.kill();
        cleanup();
        reject(
          new Error(`Error output size limit exceeded (${maxOutputSize} bytes)`)
        );
      }
    });

    child.on('error', (error) => {
      if (!killed) {
        cleanup();
        reject(error);
      }
    });

    child.on('close', (code) => {
      if (!killed) {
        cleanup();
        resolve({
          code,
          stdout,
          stderr,
          success: code === 0,
        });
      }
    });

    setTimeout(() => {
      if (child.exitCode === null) {
        killed = true;
        child.kill();
        cleanup();
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
