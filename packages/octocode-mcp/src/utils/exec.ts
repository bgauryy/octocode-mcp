import { spawn } from 'child_process';

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

// NPM Command Execution

const ALLOWED_NPM_COMMANDS = [
  'view',
  'search',
  'ping',
  'config',
  'whoami',
] as const;

type NpmCommand = (typeof ALLOWED_NPM_COMMANDS)[number];

type NpmExecOptions = {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
};

interface NpmExecResult {
  stdout: string;
  stderr: string;
  error?: Error;
  exitCode?: number;
}

/**
 * Safely escape shell arguments to prevent injection
 */
function escapeShellArg(arg: string): string {
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
 * Check if npm registry is available by running `npm ping`
 * @param timeoutMs - Timeout in milliseconds (default 10000ms)
 * @returns true if npm registry is reachable, false otherwise
 */
export async function checkNpmAvailability(
  timeoutMs: number = 10000
): Promise<boolean> {
  const result = await executeNpmCommand('ping', [], { timeout: timeoutMs });
  return !result.error && result.exitCode === 0;
}

/**
 * Execute NPM command with security validation using spawn (safer than exec)
 */
export async function executeNpmCommand(
  command: NpmCommand,
  args: string[],
  options: NpmExecOptions = {}
): Promise<NpmExecResult> {
  if (!ALLOWED_NPM_COMMANDS.includes(command)) {
    return {
      stdout: '',
      stderr: '',
      error: new Error(`Command '${command}' is not allowed`),
    };
  }

  // Validate arguments for security
  const validation = validateArgs(args);
  if (!validation.valid) {
    return {
      stdout: '',
      stderr: '',
      error: new Error(`Invalid arguments: ${validation.error}`),
    };
  }

  const { timeout = 30000, cwd, env } = options;

  // Escape and sanitize arguments
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
      resolve({
        stdout,
        stderr,
        exitCode: code ?? undefined,
      });
    });

    childProcess.on('error', error => {
      resolve({
        stdout: '',
        stderr: '',
        error,
      });
    });

    // Handle timeout
    const timeoutHandle = setTimeout(() => {
      childProcess.kill('SIGTERM');
      resolve({
        stdout: '',
        stderr: '',
        error: new Error('Command timeout'),
      });
    }, timeout);

    childProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}
