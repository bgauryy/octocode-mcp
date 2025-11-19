import { spawn } from 'child_process';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses.js';

export function parseExecResult(
  stdout: string,
  stderr: string,
  error?: Error | null,
  exitCode?: number
): CallToolResult {
  if (error) {
    return createResult({
      data: { error: true },
      instructions: `Command failed: ${error.message}`,
      isError: true,
    });
  }

  if (stderr && stderr.trim() && exitCode !== 0) {
    return createResult({
      data: { error: true },
      instructions: `Command error: ${stderr.trim()}`,
      isError: true,
    });
  }

  const instructions =
    stderr && stderr.trim() && exitCode === 0
      ? `Warning: ${stderr.trim()}`
      : undefined;

  return createResult({
    data: stdout,
    instructions,
  });
}

export async function getGithubCLIToken(): Promise<string | null> {
  return new Promise(resolve => {
    const childProcess = spawn('gh', ['auth', 'token'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000, // 10 second timeout
      env: {
        ...process.env,
        // Remove potentially dangerous environment variables
        NODE_OPTIONS: undefined,
      },
    });

    let stdout = '';

    childProcess.stdout?.on('data', data => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', _data => {});

    childProcess.on('close', code => {
      if (code === 0) {
        const token = stdout.trim();
        resolve(token || null);
      } else {
        resolve(null);
      }
    });

    childProcess.on('error', () => {
      resolve(null);
    });

    const timeoutHandle = setTimeout(() => {
      childProcess.kill('SIGTERM');
      resolve(null);
    }, 10000);

    childProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}
