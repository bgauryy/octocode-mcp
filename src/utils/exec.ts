import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { exec as nodeExec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { existsSync, statSync } from 'fs';
import { join, isAbsolute } from 'path';
import { generateCacheKey, withCache } from './cache';
import { Mutex } from 'async-mutex';

const safeExecAsync = promisify(nodeExec);

// Global mutex for GitHub API calls to ensure only one request at a time
const githubMutex = new Mutex();

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
  // Add support for custom executable paths
  customGhPath?: string;
  customNpmPath?: string;
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
 * Safely check if a file exists and is executable
 */
function isExecutableFile(filePath: string): boolean {
  try {
    if (!existsSync(filePath)) {
      return false;
    }

    const stats = statSync(filePath);
    return stats.isFile() && !stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Enhanced Windows shell configuration with security considerations
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

  // For Windows, prefer PowerShell for better security
  if (preferredWindowsShell === 'powershell' || !preferredWindowsShell) {
    return getSecurePowerShellConfig();
  }

  // Fallback to CMD if explicitly requested
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
 * Validate custom executable path to prevent injection attacks
 */
function validateCustomPath(path: string): boolean {
  if (!path) return false;

  // Check for suspicious characters that could indicate injection attempts
  const suspiciousChars = /[;&|<>$`\\*?()[\]{}^~]/;
  if (suspiciousChars.test(path)) {
    return false;
  }

  // Must be an absolute path for security
  if (!isAbsolute(path)) {
    return false;
  }

  // Must exist and be executable
  return isExecutableFile(path);
}

/**
 * Windows-safe executable resolution (safeexec equivalent)
 * Avoids the Windows security vulnerability where current directory is searched
 */
function safeWindowsLookPath(command: string): string | null {
  if (platform() !== 'win32') {
    return null;
  }

  // Get PATH environment variable
  const pathEnv = process.env.PATH || '';
  const pathExt = process.env.PATHEXT || '.com;.exe;.bat;.cmd';
  const extensions = pathExt.split(';').filter(ext => ext.startsWith('.'));

  // Split PATH and filter out current directory (security fix)
  const pathDirs = pathEnv.split(';').filter(dir => {
    const normalized = dir.trim();
    // Exclude current directory, relative paths, and empty entries
    return (
      normalized &&
      normalized !== '.' &&
      normalized !== '.\\' &&
      normalized !== './' &&
      isAbsolute(normalized)
    );
  });

  // Try each directory in PATH
  for (const dir of pathDirs) {
    try {
      // Try with and without extensions
      const candidates = [
        join(dir, command),
        ...extensions.map(ext => join(dir, command + ext)),
      ];

      for (const candidate of candidates) {
        if (isExecutableFile(candidate)) {
          return candidate;
        }
      }
    } catch {
      // Skip invalid directories
      continue;
    }
  }

  return null;
}

/**
 * Securely resolve executable path with custom path support
 * Based on GitHub CLI's approach with GH_PATH environment variable
 */
function resolveExecutablePath(
  command: 'gh' | 'npm',
  options: ExecOptions = {}
): { path: string; source: 'custom' | 'detected' | 'system' } {
  // Support custom paths like GitHub CLI does
  if (command === 'gh') {
    const customPath = options.customGhPath || process.env.GH_PATH;
    if (customPath) {
      if (!validateCustomPath(customPath)) {
        throw new Error(`Invalid or unsafe custom gh path: ${customPath}`);
      }
      return { path: customPath, source: 'custom' };
    }

    // Try to detect installation path on Windows
    const detectedPath = detectGitHubCLIPath();
    if (detectedPath) {
      return { path: detectedPath, source: 'detected' };
    }
  }

  if (command === 'npm') {
    const customPath = options.customNpmPath || process.env.NPM_PATH;
    if (customPath) {
      if (!validateCustomPath(customPath)) {
        throw new Error(`Invalid or unsafe custom npm path: ${customPath}`);
      }
      return { path: customPath, source: 'custom' };
    }

    // Try to detect installation path on Windows
    const detectedPath = detectNpmPath();
    if (detectedPath) {
      return { path: detectedPath, source: 'detected' };
    }
  }

  // For Windows, use safe path resolution
  if (platform() === 'win32') {
    const safePath = safeWindowsLookPath(command);
    if (safePath) {
      return { path: safePath, source: 'system' };
    }
  }

  // Fallback to command name for PATH resolution on non-Windows
  return { path: command, source: 'system' };
}

/**
 * Enhanced PowerShell argument escaping based on GitHub CLI's approach
 */
function escapePowerShellArg(arg: string): string {
  // Handle empty strings
  if (arg === '') {
    return "''";
  }

  // If no special characters, return as-is
  if (!/[\s&<>|;`$@"'()[\]{}]/.test(arg)) {
    return arg;
  }

  // Use single quotes for most cases (safer than double quotes)
  // Escape single quotes by doubling them
  return `'${arg.replace(/'/g, "''")}'`;
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

  try {
    // Get shell configuration
    const shellConfig = getShellConfig(options.windowsShell);

    // Resolve executable path securely
    const { path: npmExecutable, source } = resolveExecutablePath(
      'npm',
      options
    );

    // Build command with escaped arguments
    const escapedArgs = args.map(arg => escapeShellArg(arg, shellConfig.type));

    const fullCommand = `${npmExecutable} ${command} ${escapedArgs.join(' ')}`;

    const executeNpmCommand = () =>
      executeCommand(fullCommand, 'npm', options, shellConfig);

    if (options.cache) {
      const cacheKey = generateCacheKey('npm-exec', {
        command,
        args,
        shell: shellConfig.type,
        customPath: options.customNpmPath,
        executableSource: source,
      });
      return withCache(cacheKey, executeNpmCommand);
    }

    return executeNpmCommand();
  } catch (error) {
    return createErrorResult('Failed to resolve NPM executable', error);
  }
}

/**
 * Execute GitHub CLI commands safely with enhanced security
 * Uses a mutex to ensure only one GitHub request is processed at a time
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

  // Use mutex to serialize all GitHub requests with timeout
  const MUTEX_TIMEOUT = 30000; // 30 seconds

  const mutexOperation = githubMutex.runExclusive(async () => {
    try {
      // Get shell configuration
      const shellConfig = getShellConfig(options.windowsShell);

      // Resolve executable path securely
      const { path: ghExecutable, source } = resolveExecutablePath(
        'gh',
        options
      );

      // Build command with escaped arguments
      const escapedArgs = args.map(arg =>
        escapeShellArg(arg, shellConfig.type)
      );

      const fullCommand = `${ghExecutable} ${command} ${escapedArgs.join(' ')}`;

      const executeGhCommand = () =>
        executeCommand(fullCommand, 'github', options, shellConfig);

      if (options.cache) {
        const cacheKey = generateCacheKey('gh-exec', {
          command,
          args,
          shell: shellConfig.type,
          customPath: options.customGhPath,
          executableSource: source,
        });
        return withCache(cacheKey, executeGhCommand);
      }

      return executeGhCommand();
    } catch (error) {
      return createErrorResult(
        'Failed to resolve GitHub CLI executable',
        error
      );
    }
  });

  // Add timeout handling to prevent deadlock
  const timeoutPromise = new Promise<CallToolResult>((_, reject) =>
    setTimeout(
      () =>
        reject(new Error('GitHub mutex operation timeout after 30 seconds')),
      MUTEX_TIMEOUT
    )
  );

  return Promise.race([mutexOperation, timeoutPromise]).catch(
    (error: Error) => {
      return createErrorResult('GitHub operation failed or timed out', error);
    }
  );
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

/**
 * Get the most secure PowerShell execution configuration
 */
function getSecurePowerShellConfig(): ShellConfig {
  const isWindows = platform() === 'win32';

  if (!isWindows) {
    throw new Error('PowerShell configuration only available on Windows');
  }

  // Try to detect PowerShell Core (pwsh) first, then fallback to Windows PowerShell
  const pwshPaths = [
    process.env.PROGRAMFILES + '\\PowerShell\\7\\pwsh.exe',
    process.env['PROGRAMFILES(X86)'] + '\\PowerShell\\7\\pwsh.exe',
  ];

  for (const path of pwshPaths) {
    if (path && isExecutableFile(path)) {
      return {
        shell: path,
        shellEnv: path,
        type: 'powershell',
      };
    }
  }

  // Fallback to Windows PowerShell
  return {
    shell: 'powershell.exe',
    shellEnv: 'powershell.exe',
    type: 'powershell',
  };
}

/**
 * Detect GitHub CLI installation path on Windows
 * Based on common installation methods
 */
function detectGitHubCLIPath(): string | null {
  if (platform() !== 'win32') {
    return null;
  }

  // Common installation paths on Windows
  const commonPaths = [
    // WinGet installation
    process.env.LOCALAPPDATA + '\\Microsoft\\WindowsApps\\gh.exe',
    // Scoop installation
    process.env.USERPROFILE + '\\scoop\\apps\\gh\\current\\bin\\gh.exe',
    // Chocolatey installation
    process.env.PROGRAMDATA + '\\chocolatey\\bin\\gh.exe',
    // MSI installation
    process.env.PROGRAMFILES + '\\GitHub CLI\\gh.exe',
    // Alternative Program Files
    process.env['PROGRAMFILES(X86)'] + '\\GitHub CLI\\gh.exe',
  ];

  // Check each path and return the first valid one
  for (const path of commonPaths) {
    if (path && isExecutableFile(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Detect NPM installation path on Windows
 */
function detectNpmPath(): string | null {
  if (platform() !== 'win32') {
    return null;
  }

  // Common NPM installation paths on Windows
  const commonPaths = [
    // Node.js installation
    process.env.PROGRAMFILES + '\\nodejs\\npm.cmd',
    process.env['PROGRAMFILES(X86)'] + '\\nodejs\\npm.cmd',
    // npm global installation
    process.env.APPDATA + '\\npm\\npm.cmd',
    // Chocolatey installation
    process.env.PROGRAMDATA + '\\chocolatey\\bin\\npm.exe',
  ];

  for (const path of commonPaths) {
    if (path && isExecutableFile(path)) {
      return path;
    }
  }

  return null;
}
