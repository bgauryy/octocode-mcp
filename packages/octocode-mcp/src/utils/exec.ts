import { spawn } from 'child_process';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../responses.js';
import type { ExecOptions } from '../types.js';

const ALLOWED_NPM_COMMANDS = [
  'view',
  'search',
  'ping',
  'config',
  'whoami',
] as const;

export type NpmCommand = (typeof ALLOWED_NPM_COMMANDS)[number];

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

function escapeShellArg(arg: string): string {
  return arg
    .replace(/[`$\\]/g, '\\$&')
    .replace(/[;&|><]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateArgs(args: string[]): { valid: boolean; error?: string } {
  for (const arg of args) {
    if (arg.includes('\0')) {
      return { valid: false, error: 'Null bytes not allowed in arguments' };
    }
    if (arg.length > 1000) {
      return { valid: false, error: 'Argument too long' };
    }
    const suspiciousPatterns = [
      /\$\(/,
      /`[^`]*`/,
      /\|\s*\w/,
      /;\s*\w/,
      /&&\s*\w/,
      /\|\|\s*\w/,
      />\s*\/|<\s*\//,
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

export async function executeNpmCommand(
  command: NpmCommand,
  args: string[],
  options: ExecOptions = {}
): Promise<CallToolResult> {
  if (!ALLOWED_NPM_COMMANDS.includes(command)) {
    return createResult({
      data: { error: `Command '${command}' is not allowed` },
      instructions: `Command '${command}' is not allowed`,
      isError: true,
    });
  }

  const validation = validateArgs(args);
  if (!validation.valid) {
    return createResult({
      data: { error: `Invalid arguments: ${validation.error}` },
      instructions: `Invalid arguments: ${validation.error}`,
      isError: true,
    });
  }

  const { timeout = 30000, cwd, env } = options;

  const sanitizedArgs = args.map(escapeShellArg);
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
            code ?? undefined
          )
        );
      }
    });

    childProcess.on('error', error => {
      resolve(parseExecResult('', '', error));
    });

    const timeoutHandle = setTimeout(() => {
      childProcess.kill('SIGTERM');
      resolve(parseExecResult('', '', new Error('Command timeout')));
    }, timeout);

    childProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
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
