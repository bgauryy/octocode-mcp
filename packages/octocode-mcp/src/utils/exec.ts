import { spawn } from 'child_process';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses';

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
  error?: Error | null,
  exitCode?: number
): CallToolResult {
  if (error) {
    return createResult({
      isError: true,
      hints: [`Command failed: ${error.message}`],
    });
  }

  // If exit code is 0 (success), treat stderr as warnings, not errors
  if (stderr && stderr.trim() && exitCode !== 0) {
    return createResult({
      isError: true,
      hints: [`Command error: ${stderr.trim()}`],
    });
  }

  // Include stderr as warnings if present but command succeeded
  const hints =
    stderr && stderr.trim() && exitCode === 0
      ? [`Warning: ${stderr.trim()}`]
      : undefined;

  return createResult({
    data: stdout,
    hints,
  });
}

/**
 * Safely escape shell arguments to prevent injection
 */
function escapeShellArg(arg: string): string {
  // Remove or escape dangerous characters
  return arg
    .replace(/[`$\\]/g, '\\$&') // Escape backticks, dollar signs, backslashes
    .replace(/[;&|><]/g, '') // Remove shell operators
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Validate arguments for safety
 */
function validateArgs(args: string[]): { valid: boolean; error?: string } {
  for (const arg of args) {
    // Check for null bytes (command injection technique)
    if (arg.includes('\0')) {
      return { valid: false, error: 'Null bytes not allowed in arguments' };
    }

    // Check for excessively long arguments (potential DoS)
    if (arg.length > 1000) {
      return { valid: false, error: 'Argument too long' };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\$\(/, // Command substitution
      /`[^`]*`/, // Backtick command substitution
      /\|\s*\w/, // Pipe to command
      /;\s*\w/, // Command chaining
      /&&\s*\w/, // AND command chaining
      /\|\|\s*\w/, // OR command chaining
      />\s*\/|<\s*\//, // File redirection to/from root
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(arg)) {
        return {
          valid: false,
          error: `Suspicious pattern detected in argument: ${arg.substring(0, 50)}...`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Execute NPM command with security validation using spawn (safer than exec)
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

  // Validate arguments for security
  const validation = validateArgs(args);
  if (!validation.valid) {
    return createResult({
      isError: true,
      hints: [`Invalid arguments: ${validation.error}`],
    });
  }

  const { timeout = 30000, cwd, env } = options;

  // Escape and sanitize arguments
  const sanitizedArgs = args.map(escapeShellArg);

  // Use spawn instead of exec for better security
  return new Promise(resolve => {
    const childProcess = spawn('npm', [command, ...sanitizedArgs], {
      cwd,
      env: {
        ...process.env,
        ...env,
        // Remove potentially dangerous environment variables
        NODE_OPTIONS: undefined,
        NPM_CONFIG_SCRIPT_SHELL: undefined,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', data => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', data => {
      stderr += data.toString();
    });

    childProcess.on('close', code => {
      if (code === 0) {
        resolve(parseExecResult(stdout, stderr, null, 0));
      } else {
        resolve(
          parseExecResult(
            stdout,
            stderr,
            new Error(`Process exited with code ${code}`),
            code
          )
        );
      }
    });

    childProcess.on('error', error => {
      resolve(parseExecResult('', '', error));
    });

    // Handle timeout
    const timeoutHandle = setTimeout(() => {
      childProcess.kill('SIGTERM');
      resolve(parseExecResult('', '', new Error('Command timeout')));
    }, timeout);

    childProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}

/**
 * Get GitHub CLI authentication token using safe spawn method
 * Returns the value from 'gh auth token' command
 */
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

    childProcess.stderr?.on('data', _data => {
      // Ignore stderr for token retrieval
    });

    childProcess.on('close', code => {
      if (code === 0) {
        const token = stdout.trim();
        resolve(token || null);
      } else {
        // Return null on error - let calling code handle it
        resolve(null);
      }
    });

    childProcess.on('error', () => {
      // Return null on error - let calling code handle it
      resolve(null);
    });

    // Handle timeout
    const timeoutHandle = setTimeout(() => {
      childProcess.kill('SIGTERM');
      resolve(null);
    }, 10000);

    childProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}
