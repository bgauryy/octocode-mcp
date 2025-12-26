/**
 * Safe command execution with security validation
 * Validates commands and execution context before spawning processes
 */

import { spawn, ChildProcess } from 'child_process';
import { validateCommand } from '../../../security/commandValidator.js';
import { validateExecutionContext } from '../../../security/executionContextValidator.js';
import type { ExecResult, ExecOptions } from '../../../utils/types.js';

/**
 * Safely execute a command with security validation
 * @param command - The command to execute
 * @param args - Command arguments
 * @param options - Execution options (cwd, timeout, maxOutputSize, etc.)
 * @returns Promise resolving to ExecResult
 */
export async function safeExec(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  // Validate command
  const commandValidation = validateCommand(command, args);
  if (!commandValidation.isValid) {
    throw new Error(
      `Command validation failed: ${commandValidation.error || 'Command not allowed'}`
    );
  }

  // Validate execution context
  const contextValidation = validateExecutionContext(
    options.cwd,
    process.env.WORKSPACE_ROOT
  );
  if (!contextValidation.isValid) {
    throw new Error(
      `Execution context validation failed: ${contextValidation.error || 'Invalid working directory'}`
    );
  }

  const {
    timeout = 30000,
    cwd,
    env,
    maxOutputSize = 10 * 1024 * 1024, // 10MB default
  } = options;

  return new Promise((resolve, reject) => {
    let childProcess: ChildProcess;
    let stdout = '';
    let stderr = '';
    let killed = false;

    try {
      childProcess = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          ...env,
          NODE_OPTIONS: undefined,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(
        new Error(
          `Failed to spawn command '${command}': ${error instanceof Error ? error.message : 'Spawn failed'}`
        )
      );
      return;
    }

    // Timeout handling
    const timeoutHandle = setTimeout(() => {
      if (!killed) {
        killed = true;
        childProcess.kill('SIGKILL');
        reject(new Error(`Command timeout after ${timeout}ms`));
      }
    }, timeout);

    // Output size tracking
    let totalOutputSize = 0;

    // Collect stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      if (killed) return;

      const chunk = data.toString();
      totalOutputSize += Buffer.byteLength(chunk);

      if (totalOutputSize > maxOutputSize) {
        if (!killed) {
          killed = true;
          childProcess.kill('SIGKILL');
          clearTimeout(timeoutHandle);
          reject(new Error('Output size limit exceeded'));
        }
        return;
      }

      stdout += chunk;
    });

    // Collect stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      if (killed) return;

      const chunk = data.toString();
      totalOutputSize += Buffer.byteLength(chunk);

      if (totalOutputSize > maxOutputSize) {
        if (!killed) {
          killed = true;
          childProcess.kill('SIGKILL');
          clearTimeout(timeoutHandle);
          reject(new Error('Output size limit exceeded'));
        }
        return;
      }

      stderr += chunk;
    });

    // Handle process close
    childProcess.on('close', code => {
      if (killed) return;

      clearTimeout(timeoutHandle);

      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
      });
    });

    // Handle spawn errors
    childProcess.on('error', error => {
      if (killed) return;

      killed = true;
      clearTimeout(timeoutHandle);
      reject(error);
    });
  });
}
