import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { exec as nodeExec } from 'child_process';
import { promisify } from 'util';
import { generateCacheKey, withCache } from './cache';

const safeExecAsync = promisify(nodeExec);

const ALLOWED_NPM_COMMANDS = [
  'view',
  'search',
  'ping',
  'whoami',
  'version',
  'config',
  'audit',
  'list',
  'outdated',
  'help',
] as const;

const ALLOWED_GH_COMMANDS = [
  'search',
  'repo',
  'api',
  'auth',
  'org',
  'help',
] as const;

type NpmCommand = (typeof ALLOWED_NPM_COMMANDS)[number];
type GhCommand = (typeof ALLOWED_GH_COMMANDS)[number];
type ExecOptions = {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  cache?: boolean;
};

function createSuccessResult(data: any): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError: false,
  };
}

function createErrorResult(message: string, error: unknown): CallToolResult {
  return {
    content: [
      { type: 'text', text: `${message}: ${(error as Error).message}` },
    ],
    isError: true,
  };
}

function isValidNpmCommand(command: string): command is NpmCommand {
  return ALLOWED_NPM_COMMANDS.includes(command as NpmCommand);
}

function isValidGhCommand(command: string): command is GhCommand {
  return ALLOWED_GH_COMMANDS.includes(command as GhCommand);
}

export async function executeNpmCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<CallToolResult> {
  // Only allow registered commands
  if (!isValidNpmCommand(command)) {
    return createErrorResult(
      'Command not registered',
      new Error(`NPM command '${command}' is not in the allowed list`)
    );
  }

  const fullCommand = `npm ${command} ${args.join(' ')}`;

  const executeCommand = async (): Promise<CallToolResult> => {
    try {
      const execOptions = {
        timeout: options.timeout || 30000,
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        encoding: 'utf-8' as const,
      };

      const { stdout, stderr } = await safeExecAsync(fullCommand, execOptions);

      if (stderr && !stderr.includes('npm WARN')) {
        return createErrorResult('NPM command error', new Error(stderr));
      }

      return createSuccessResult({
        command: fullCommand,
        result: stdout,
        timestamp: new Date().toISOString(),
        type: 'npm',
      });
    } catch (error) {
      return createErrorResult('Failed to execute NPM command', error);
    }
  };

  if (options.cache) {
    const cacheKey = generateCacheKey('npm-exec', { command, args });
    return withCache(cacheKey, executeCommand);
  }

  return executeCommand();
}

export async function executeGitHubCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<CallToolResult> {
  // Only allow registered commands
  if (!isValidGhCommand(command)) {
    return createErrorResult(
      'Command not registered',
      new Error(`GitHub command '${command}' is not in the allowed list`)
    );
  }

  // SIMPLE: Just join with spaces, let shell handle it naturally
  const fullCommand = `gh ${command} ${args.join(' ')}`;

  const executeCommand = async (): Promise<CallToolResult> => {
    try {
      const execOptions = {
        timeout: options.timeout || 60000,
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        encoding: 'utf-8' as const,
      };

      const { stdout, stderr } = await safeExecAsync(fullCommand, execOptions);

      if (stderr) {
        return createErrorResult('GitHub CLI command error', new Error(stderr));
      }

      return createSuccessResult({
        command: fullCommand,
        result: stdout,
        timestamp: new Date().toISOString(),
        type: 'github',
      });
    } catch (error) {
      return createErrorResult('Failed to execute GitHub CLI command', error);
    }
  };

  if (options.cache) {
    const cacheKey = generateCacheKey('gh-exec', { command, args });
    return withCache(cacheKey, executeCommand);
  }

  return executeCommand();
}
