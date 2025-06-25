import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { exec as nodeExec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { generateCacheKey, withCache } from './cache';

const safeExecAsync = promisify(nodeExec);

// Allowed command prefixes - this prevents shell injection by restricting to safe commands
const ALLOWED_NPM_COMMANDS = [
  'view',
  'search',
  'ping',
  'config',
  'whoami',
] as const;

// Allowed command prefixes - this prevents shell injection by restricting to safe commands
const ALLOWED_GH_COMMANDS = ['search', 'api', 'auth', 'org'] as const;

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

/**
 * Get platform-specific shell configuration with improved shell detection
 */
function getShellConfig(preferredWindowsShell?: WindowsShell): ShellConfig {
  const isWindows = platform() === 'win32';

  if (!isWindows) {
    // Use user's actual shell instead of hardcoded /bin/sh to avoid alias/function conflicts
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
 * Checks if a query contains GitHub search boolean operators
 */
function hasGitHubBooleanOperators(query: string): boolean {
  // Check for GitHub boolean operators (must be uppercase)
  return (
    /\b(AND|OR|NOT)\b/.test(query) ||
    /\s+(AND|OR|NOT)\s+/.test(query) ||
    /"[^"]*\s+(AND|OR|NOT)\s+[^"]*"/.test(query)
  );
}

/**
 * Escape shell arguments with improved GitHub CLI boolean query handling
 */
function escapeShellArg(
  arg: string,
  shellType?: 'cmd' | 'powershell' | 'unix',
  isGitHubQuery?: boolean
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
      return escapeUnixShellArg(arg, isGitHubQuery);
  }
}

/**
 * Escape arguments for PowerShell
 * PowerShell uses single quotes for literal strings and has special escaping rules
 */
function escapePowerShellArg(arg: string): string {
  // PowerShell special characters that need escaping
  if (/[\s&<>|;`$@"'()[\]{}]/.test(arg)) {
    // Use single quotes for literal strings in PowerShell
    // Escape single quotes by doubling them
    return `'${arg.replace(/'/g, "''")}'`;
  }
  return arg;
}

/**
 * Escape arguments for Windows CMD
 */
function escapeWindowsCmdArg(arg: string): string {
  // Windows CMD escaping
  if (/[\s&<>|^"]/.test(arg)) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
}

/**
 * Escape arguments for Unix shells with special handling for GitHub CLI queries
 */
function escapeUnixShellArg(arg: string, isGitHubQuery?: boolean): string {
  // Special handling for GitHub CLI search queries to preserve boolean logic
  if (isGitHubQuery && hasGitHubBooleanOperators(arg)) {
    // For boolean queries with OR/AND/NOT, use double quotes to preserve operators
    // GitHub CLI handles boolean logic properly when quoted
    return `"${arg.replace(/"/g, '\\"')}"`;
  }

  // For GitHub queries with spaces but no boolean operators, quote them
  if (
    isGitHubQuery &&
    /\s/.test(arg) &&
    !arg.startsWith('"') &&
    !arg.endsWith('"')
  ) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }

  // For already quoted GitHub queries, pass through with escaped internal quotes
  if (isGitHubQuery && arg.startsWith('"') && arg.endsWith('"')) {
    return arg.replace(/\\"/g, '\\\\"'); // Escape already escaped quotes
  }

  // Standard Unix shell escaping for other arguments
  if (/[^\w\-._/:=@]/.test(arg)) {
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

  // Build command with validated prefix and properly escaped arguments
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
 * Execute GitHub CLI commands safely with improved boolean query handling
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

  // Build command with validated prefix and properly escaped arguments
  // First argument is typically the search query for GitHub CLI search commands
  const escapedArgs = args.map((arg, index) => {
    const isFirstArg = index === 0;
    // Detect if this is a search query (first non-subcommand argument)
    const isSearchQuery =
      command === 'search' && isFirstArg && !arg.startsWith('--');
    return escapeShellArg(arg, shellConfig.type, isSearchQuery);
  });

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
 * Execute shell commands with improved environment handling and error detection
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
        // More conservative shell environment handling
        SHELL: config.shellEnv,
        PATH: process.env.PATH,
        // Only disable problematic shell features, not all of them
        ...(config.type === 'unix' && {
          // Only disable the most problematic shell configurations
          BASH_ENV: '', // Prevent auto-sourcing of problematic configs
        }),
      },
      encoding: 'utf-8' as const,
      shell: config.shell,
    };

    const { stdout, stderr } = await safeExecAsync(fullCommand, execOptions);

    // Improved error detection that ignores shell configuration conflicts
    const shouldTreatAsError =
      type === 'npm'
        ? stderr &&
          !stderr.includes('npm WARN') &&
          !stderr.includes('npm notice')
        : stderr &&
          !stderr.includes('Warning:') &&
          !stderr.includes('notice:') &&
          // Ignore shell configuration conflicts - common in development environments
          !stderr.includes('No such file or directory') &&
          !stderr.includes('head: illegal option') &&
          !stderr.includes('head: |: No such file or directory') &&
          !stderr.includes('head: cat: No such file or directory') &&
          !/^head:\s+/.test(stderr) && // Ignore all head command errors (shell conflicts)
          !/^\s*head:\s+/.test(stderr) && // Ignore head errors with leading whitespace
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
