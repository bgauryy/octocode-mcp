import { spawnSync } from 'node:child_process';

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function runCommand(
  command: string,
  args: string[] = []
): CommandResult {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      timeout: 30000,
    });

    return {
      success: result.status === 0,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || '',
      exitCode: result.status,
    };
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error',
      exitCode: null,
    };
  }
}

export function commandExists(command: string): boolean {
  const checkCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = runCommand(checkCommand, [command]);
  return result.success;
}

export function getCommandVersion(
  command: string,
  versionFlag: string = '--version'
): string | null {
  const result = runCommand(command, [versionFlag]);
  if (result.success) {
    return result.stdout.split('\n')[0];
  }
  return null;
}

interface InteractiveCommandResult {
  success: boolean;
  exitCode: number | null;
}

export function runInteractiveCommand(
  command: string,
  args: string[] = []
): InteractiveCommandResult {
  try {
    const result = spawnSync(command, args, {
      stdio: 'inherit',
      shell: false,
    });

    return {
      success: result.status === 0,
      exitCode: result.status,
    };
  } catch {
    return {
      success: false,
      exitCode: null,
    };
  }
}
