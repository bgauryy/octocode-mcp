import { exec } from 'child_process';
import { promisify } from 'util';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../mcp/responses';

const execAsync = promisify(exec);

const ALLOWED_NPM_COMMANDS = [
  'view',
  'search',
  'ping',
  'config',
  'whoami',
] as const;

export type NpmCommand = (typeof ALLOWED_NPM_COMMANDS)[number];

type ExecOptions = {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  cache?: boolean;
};

/**
 * Parse execution result into a standardized format
 */
export function parseExecResult(
  stdout: string,
  stderr: string,
  error?: Error | null
): CallToolResult {
  if (error) {
    return createResult({
      isError: true,
      hints: [`Command failed: ${error.message}`],
    });
  }

  if (stderr && stderr.trim()) {
    return createResult({
      isError: true,
      hints: [`Command error: ${stderr.trim()}`],
    });
  }

  return createResult({
    data: stdout,
  });
}

/**
 * Execute NPM command with security validation
 */
export async function executeNpmCommand(
  command: NpmCommand,
  args: string[],
  options: ExecOptions = {}
): Promise<CallToolResult> {
  if (!ALLOWED_NPM_COMMANDS.includes(command)) {
    return createResult({
      isError: true,
      hints: [`Command '${command}' is not allowed`],
    });
  }

  const { timeout = 30000, cwd, env } = options;
  const fullCommand = `npm ${command} ${args.join(' ')}`;

  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      timeout,
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    });

    return parseExecResult(stdout, stderr);
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string };
    return parseExecResult(
      execError.stdout || '',
      execError.stderr || '',
      execError
    );
  }
}

/**
 * Get GitHub CLI authentication token
 * Returns the value from 'gh auth token' command
 */
export async function getGithubCLIToken(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('gh auth token', {
      timeout: 10000, // 10 second timeout
      encoding: 'utf-8',
    });

    const token = stdout.trim();
    return token || null;
  } catch (error) {
    // Return null on error - let calling code handle it
    return null;
  }
}
