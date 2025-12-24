import { spawn } from 'child_process';
import { dirname, join } from 'path';

/**
 * Get the npm binary path by looking next to the current node binary.
 * This ensures npm is found even when PATH doesn't include it.
 */
function getNpmPath(): string {
  const nodeDir = dirname(process.execPath);
  return join(nodeDir, 'npm');
}

export async function getGithubCLIToken(): Promise<string | null> {
  return new Promise(resolve => {
    const childProcess = spawn('gh', ['auth', 'token'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000, // 10 second timeout
      env: {
        ...process.env,
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
 * Validate arguments for safety
 */
function validateArgs(args: string[]): { valid: boolean; error?: string } {
  for (const arg of args) {
    if (arg.includes('\0')) {
      return { valid: false, error: 'Null bytes not allowed in arguments' };
    }

    if (arg.length > 1000) {
      return { valid: false, error: 'Argument too long' };
    }
  }

  return { valid: true };
}

/**
 * Check if npm CLI is available by running `npm --version`
 * @param timeoutMs - Timeout in milliseconds (default 10000ms)
 * @returns true if npm CLI is installed and accessible, false otherwise
 */
export async function checkNpmAvailability(
  timeoutMs: number = 10000
): Promise<boolean> {
  return new Promise(resolve => {
    const childProcess = spawn(getNpmPath(), ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: {
        ...process.env,
        NODE_OPTIONS: undefined,
      },
    });

    childProcess.on('close', code => {
      resolve(code === 0);
    });

    childProcess.on('error', () => {
      resolve(false);
    });

    const timeoutHandle = setTimeout(() => {
      childProcess.kill('SIGTERM');
      resolve(false);
    }, timeoutMs);

    childProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
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

  const validation = validateArgs(args);
  if (!validation.valid) {
    return {
      stdout: '',
      stderr: '',
      error: new Error(`Invalid arguments: ${validation.error}`),
    };
  }

  const { timeout = 30000, cwd, env } = options;

  return new Promise(resolve => {
    const childProcess = spawn(getNpmPath(), [command, ...args], {
      cwd,
      env: {
        ...process.env,
        ...env,
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
