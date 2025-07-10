import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { exec as nodeExec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { generateCacheKey, withCache } from './cache';

const safeExecAsync = promisify(nodeExec);

const ALLOWED_NPM_COMMANDS = [
  'view',
  'search',
  'ping',
  'config',
  'whoami',
] as const;

const ALLOWED_GH_COMMANDS = [
  'search',
  'api',
  'auth',
  'org',
  'pr',
  'repo',
] as const;

export type NpmCommand = (typeof ALLOWED_NPM_COMMANDS)[number];
export type GhCommand = (typeof ALLOWED_GH_COMMANDS)[number];
export type WindowsShell = 'cmd' | 'powershell';

type ExecOptions = {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  cache?: boolean;
  windowsShell?: WindowsShell; // Allow shell preference for Windows
};

type ShellConfig = {
  shell: string;
  shellEnv: string;
  type: 'cmd' | 'powershell' | 'unix';
};

function createSuccessResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError: false,
  };
}

function createErrorResult(message: string, error: unknown): CallToolResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: `${message}: ${errorMessage}` }],
    isError: true,
  };
}

function isValidNpmCommand(command: string): command is NpmCommand {
  return ALLOWED_NPM_COMMANDS.includes(command as NpmCommand);
}

function isValidGhCommand(command: string): command is GhCommand {
  return ALLOWED_GH_COMMANDS.includes(command as GhCommand);
}

/**
 * Get platform-specific shell configuration
 */
function getShellConfig(preferredWindowsShell?: WindowsShell): ShellConfig {
  const isWindows = platform() === 'win32';

  if (!isWindows) {
    const userShell = process.env.SHELL || '/bin/sh';
    return {
      shell: userShell,
      shellEnv: userShell,
      type: 'unix',
    };
  }

  // Windows shell selection
  const usesPowerShell = preferredWindowsShell === 'powershell';

  if (usesPowerShell) {
    return {
      shell: 'powershell.exe',
      shellEnv: 'powershell.exe',
      type: 'powershell',
    };
  }

  return {
    shell: 'cmd.exe',
    shellEnv: 'cmd.exe',
    type: 'cmd',
  };
}

/**
 * Escape shell arguments
 */
function escapeShellArg(
  arg: string,
  shellType?: 'cmd' | 'powershell' | 'unix'
): string {
  // Auto-detect shell type if not provided
  if (!shellType) {
    const isWindows = platform() === 'win32';
    shellType = isWindows ? 'cmd' : 'unix';
  }

  switch (shellType) {
    case 'powershell':
      return escapePowerShellArg(arg);
    case 'cmd':
      return escapeWindowsCmdArg(arg);
    case 'unix':
    default:
      return escapeUnixShellArg(arg);
  }
}

/**
 * Escape arguments for PowerShell
 */
function escapePowerShellArg(arg: string): string {
  if (/[\s&<>|;`$@"'()[\]{}]/.test(arg)) {
    return `'${arg.replace(/'/g, "''")}'`;
  }
  return arg;
}

/**
 * Escape arguments for Windows CMD
 */
function escapeWindowsCmdArg(arg: string): string {
  if (/[\s&<>|^"]/.test(arg)) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
}

/**
 * Escape arguments for Unix shells
 */
function escapeUnixShellArg(arg: string): string {
  // Only escape if contains dangerous shell metacharacters
  if (/[;&|<>$`\\*?()[\]{}^~\s]/.test(arg)) {
    return `'${arg.replace(/'/g, "'\"'\"'")}'`;
  }
  return arg;
}

/**
 * Execute NPM commands safely by validating against allowed commands
 * Security: Only executes commands that start with "npm {ALLOWED_COMMAND}"
 */
export async function executeNpmCommand(
  command: NpmCommand,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<CallToolResult> {
  // Security check: only allow registered commands
  if (!isValidNpmCommand(command)) {
    return createErrorResult(
      'Command not registered',
      new Error(`NPM command '${command}' is not in the allowed list`)
    );
  }

  // Get shell configuration
  const shellConfig = getShellConfig(options.windowsShell);

  // Build command with escaped arguments
  const escapedArgs = args.map(arg => escapeShellArg(arg, shellConfig.type));

  const fullCommand = `npm ${command} ${escapedArgs.join(' ')}`;

  const executeNpmCommand = () =>
    executeCommand(fullCommand, 'npm', options, shellConfig);

  if (options.cache) {
    const cacheKey = generateCacheKey('npm-exec', {
      command,
      args,
      shell: shellConfig.type,
    });
    return withCache(cacheKey, executeNpmCommand);
  }

  return executeNpmCommand();
}

/**
 * Execute GitHub CLI commands safely
 */
export async function executeGitHubCommand(
  command: GhCommand,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<CallToolResult> {
  // Security check: only allow registered commands
  if (!isValidGhCommand(command)) {
    return createErrorResult(
      'Command not registered',
      new Error(`GitHub command '${command}' is not in the allowed list`)
    );
  }

  // Get shell configuration
  const shellConfig = getShellConfig(options.windowsShell);

  // Build command with escaped arguments
  const escapedArgs = args.map(arg => escapeShellArg(arg, shellConfig.type));

  const fullCommand = `gh ${command} ${escapedArgs.join(' ')}`;

  const executeGhCommand = () =>
    executeCommand(fullCommand, 'github', options, shellConfig);

  if (options.cache) {
    const cacheKey = generateCacheKey('gh-exec', {
      command,
      args,
      shell: shellConfig.type,
    });
    return withCache(cacheKey, executeGhCommand);
  }

  return executeGhCommand();
}

/**
 * Execute shell commands
 */
async function executeCommand(
  fullCommand: string,
  type: 'npm' | 'github',
  options: ExecOptions = {},
  shellConfig?: ShellConfig
): Promise<CallToolResult> {
  try {
    const defaultTimeout = type === 'npm' ? 30000 : 60000;
    const config = shellConfig || getShellConfig(options.windowsShell);

    const execOptions = {
      timeout: options.timeout || defaultTimeout,
      maxBuffer: 5 * 1024 * 1024, // 5MB buffer limit (increased from default 1MB)
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      encoding: 'utf-8' as const,
      shell: config.shell,
    };

    const { stdout, stderr } = await safeExecAsync(fullCommand, execOptions);

    // Simple error detection
    const shouldTreatAsError =
      type === 'npm'
        ? stderr &&
          !stderr.includes('npm WARN') &&
          !stderr.includes('npm notice')
        : stderr &&
          !stderr.includes('Warning:') &&
          !stderr.includes('notice:') &&
          stderr.trim() !== '';

    if (shouldTreatAsError) {
      const errorType =
        type === 'npm' ? 'NPM command error' : 'GitHub CLI command error';
      return createErrorResult(errorType, new Error(stderr));
    }

    // Try to parse stdout as JSON, fallback to string if not possible
    let parsedResult: unknown = stdout;
    try {
      parsedResult = JSON.parse(stdout);
    } catch {
      // Not JSON, keep as string
    }
    return createSuccessResult({
      command: fullCommand,
      result: parsedResult,
      timestamp: new Date().toISOString(),
      type,
      platform: platform(),
      shell: config.shell,
      shellType: config.type,
      ...(stderr && { warning: stderr }), // Include warnings but don't treat as error
    });
  } catch (error) {
    const errorMessage =
      type === 'npm'
        ? 'Failed to execute NPM command'
        : 'Failed to execute GitHub CLI command';
    return createErrorResult(errorMessage, error);
  }
}
