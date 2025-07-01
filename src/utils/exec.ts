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
 * Escape shell arguments with improved GitHub CLI query handling
 */
function escapeShellArg(
  arg: string,
  shellType?: 'cmd' | 'powershell' | 'unix',
  isGitHubQuery?: boolean // Flag to indicate if this is the main GitHub search query argument
): string {
  // Auto-detect shell type if not provided
  if (!shellType) {
    const isWindows = platform() === 'win32';
    shellType = isWindows ? 'cmd' : 'unix';
  }

  // Special handling for GitHub search queries to preserve AND logic
  if (isGitHubQuery) {
    // If the argument already contains quotes, preserve them for exact phrases
    if (arg.includes('"')) {
      // For Unix-like shells, wrap the entire argument in single quotes
      if (shellType === 'unix') {
        return `'${arg.replace(/'/g, "'\"'\"'")}'`;
      }
      // For Windows CMD
      if (shellType === 'cmd') {
        return `"${arg.replace(/"/g, '""')}"`;
      }
      // For PowerShell
      return `'${arg.replace(/'/g, "''")}'`;
    }

    // For space-separated terms (AND search), minimize escaping
    if (arg.includes(' ') && shellType === 'unix') {
      // Only escape if contains dangerous shell characters
      if (!/[;&|<>$`\\]/.test(arg)) {
        return `"${arg}"`;
      }
    }
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
 * Preserves AND search logic by not over-escaping space-separated terms
 */
function escapeUnixShellArg(arg: string, isGitHubQuery?: boolean): string {
  // For GitHub search queries, we need to preserve AND logic
  if (isGitHubQuery) {
    // If the query contains quotes, preserve them for exact phrase matching
    if (arg.includes('"')) {
      // Use single quotes to wrap the entire query while preserving internal quotes
      return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }

    // For space-separated terms (AND search), only escape if absolutely necessary
    // GitHub CLI expects space-separated terms for AND logic
    if (arg.includes(' ') && !/[;&|<>$`\\]/.test(arg)) {
      // Only wrap in quotes if it contains shell metacharacters beyond spaces
      return `"${arg}"`;
    }

    // For single terms or terms with special chars, escape normally
    if (/[;&|<>$`\\]/.test(arg)) {
      return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }

    // Simple terms don't need escaping
    return arg;
  }

  // Standard Unix shell escaping for other arguments
  if (/[^a-zA-Z0-9\-_./=@:]/.test(arg)) {
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
  // For GitHub search commands, qualifiers like "language:typescript" should not be escaped
  // Only the main query term (if it contains spaces) needs escaping
  const escapedArgs = args.map((arg, index) => {
    const isMainQueryArgument = command === 'search' && index === 1;
    const isGitHubQualifier =
      command === 'search' &&
      index > 1 &&
      (arg.includes(':') || arg.startsWith('(')) &&
      !arg.startsWith('--');

    // GitHub search qualifiers need special handling
    // Most qualifiers can be passed as-is, but those with shell metacharacters need escaping
    if (isGitHubQualifier) {
      // Check if the qualifier contains shell metacharacters that need escaping
      if (/[<>&|;`$\\]/.test(arg)) {
        // Escape qualifiers that contain shell metacharacters like size:<1000, size:>500
        return escapeShellArg(arg, shellConfig.type, false);
      }
      // Safe qualifiers like "language:typescript", "user:microsoft" can be passed as-is
      return arg;
    }

    return escapeShellArg(arg, shellConfig.type, isMainQueryArgument);
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

      // Enhanced error messaging for common GitHub issues
      if (type === 'github' && stderr.includes('404')) {
        const isRepoNotFound = stderr.includes('Not Found');
        const enhancedMessage = isRepoNotFound
          ? `${stderr}\n\nThis is often due to incorrect repository name. Use github_search_code to find the correct repository.`
          : stderr;
        return createErrorResult(errorType, new Error(enhancedMessage));
      }

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
