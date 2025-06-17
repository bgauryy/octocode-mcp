import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { exec as nodeExec } from 'child_process';
import { promisify } from 'util';
import { generateCacheKey, withCache } from './cache';

const safeExecAsync = promisify(nodeExec);

const ALLOWED_NPM_COMMANDS = ['view', 'search', 'ping'] as const;

const ALLOWED_GH_COMMANDS = ['search', 'api', 'auth', 'org'] as const;

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

function sanitizeArgs(args: string[]): string[] {
  return args.map(arg => {
    // Check if arg contains GitHub boolean operators or qualifiers - don't quote these
    const hasGitHubSyntax =
      /\b(AND|OR|NOT)\b/.test(arg) || /\w+:[^\s]+/.test(arg);

    if (hasGitHubSyntax) {
      // GitHub search syntax - preserve as-is
      return arg;
    }

    // Check if arg contains shell special characters that need quoting
    const needsQuoting = /[(){}[\]<>|&;$`\\'"*?~\s]/.test(arg);

    if (needsQuoting && !arg.startsWith('"') && !arg.startsWith("'")) {
      // Escape double quotes and backslashes within the argument
      const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `"${escaped}"`;
    }

    return arg;
  });
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

  const sanitizedArgs = sanitizeArgs(args);
  const fullCommand = `npm ${command} ${sanitizedArgs.join(' ')}`;

  const executeNpmCommand = () => executeCommand(fullCommand, 'npm', options);

  if (options.cache) {
    const cacheKey = generateCacheKey('npm-exec', { command, args });
    return withCache(cacheKey, executeNpmCommand);
  }

  return executeNpmCommand();
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

  const sanitizedArgs = sanitizeArgs(args);
  const fullCommand = `gh ${command} ${sanitizedArgs.join(' ')}`;

  const executeGhCommand = () => executeCommand(fullCommand, 'github', options);

  if (options.cache) {
    const cacheKey = generateCacheKey('gh-exec', { command, args });
    return withCache(cacheKey, executeGhCommand);
  }

  return executeGhCommand();
}

async function executeCommand(
  fullCommand: string,
  type: 'npm' | 'github',
  options: ExecOptions = {}
): Promise<CallToolResult> {
  try {
    const defaultTimeout = type === 'npm' ? 30000 : 60000;
    const execOptions = {
      timeout: options.timeout || defaultTimeout,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      encoding: 'utf-8' as const,
    };

    const { stdout, stderr } = await safeExecAsync(fullCommand, execOptions);

    // Handle different warning patterns for npm vs gh
    const shouldTreatAsError =
      type === 'npm'
        ? stderr && !stderr.includes('npm WARN')
        : stderr && !stderr.includes('Warning:') && !stderr.includes('notice:');

    if (shouldTreatAsError) {
      const errorType =
        type === 'npm' ? 'NPM command error' : 'GitHub CLI command error';
      return createErrorResult(errorType, new Error(stderr));
    }

    return createSuccessResult({
      command: fullCommand,
      result: stdout,
      timestamp: new Date().toISOString(),
      type,
    });
  } catch (error) {
    const errorMessage =
      type === 'npm'
        ? 'Failed to execute NPM command'
        : 'Failed to execute GitHub CLI command';
    return createErrorResult(errorMessage, error);
  }
}
