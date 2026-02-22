/**
 * Command availability checking utilities
 * Verifies that required CLI tools (rg, find, ls) are available before use
 */

import { spawnCheckSuccess } from './spawn.js';

/**
 * Result of command availability check
 */
interface CommandAvailabilityResult {
  available: boolean;
  command: string;
  version?: string;
  error?: string;
}

/**
 * Cached availability results to avoid repeated checks
 */
const availabilityCache = new Map<string, CommandAvailabilityResult>();

/**
 * POSIX-standard commands guaranteed on macOS/Linux — skip subprocess checks.
 */
const POSIX_COMMANDS = new Set<string>(['grep', 'find', 'ls']);

/** Timeout for command availability checks, configurable via environment variable */
const COMMAND_CHECK_TIMEOUT_MS =
  parseInt(process.env.OCTOCODE_COMMAND_CHECK_TIMEOUT_MS || '5000', 10) || 5000;

/**
 * Required commands for local tools
 */
export const REQUIRED_COMMANDS = {
  rg: { name: 'ripgrep', versionFlag: '--version', tool: 'localSearchCode' },
  grep: {
    name: 'grep',
    versionFlag: '--version',
    tool: 'localSearchCode (fallback)',
  },
  find: { name: 'find', versionFlag: '--version', tool: 'localFindFiles' },
  ls: { name: 'ls', versionFlag: '--version', tool: 'localViewStructure' },
} as const;

type CommandName = keyof typeof REQUIRED_COMMANDS;

/**
 * Check if a specific command is available
 * Results are cached for efficiency
 *
 * @param command - The command to check (rg, find, ls)
 * @param forceCheck - Skip cache and re-check availability
 * @returns Promise<CommandAvailabilityResult>
 */
export async function checkCommandAvailability(
  command: CommandName,
  forceCheck = false
): Promise<CommandAvailabilityResult> {
  if (!forceCheck && availabilityCache.has(command)) {
    return availabilityCache.get(command)!;
  }

  const cmdInfo = REQUIRED_COMMANDS[command];

  // POSIX-standard commands are always present on macOS/Linux — skip spawn check
  if (POSIX_COMMANDS.has(command) && process.platform !== 'win32') {
    const result: CommandAvailabilityResult = {
      available: true,
      command,
    };
    availabilityCache.set(command, result);
    return result;
  }

  try {
    // macOS find doesn't support --version, use different approach
    let isAvailable: boolean;

    if (command === 'find' && process.platform === 'darwin') {
      // On macOS, just check if find exists by running with minimal args
      isAvailable = await spawnCheckSuccess(
        'find',
        ['.', '-maxdepth', '0'],
        COMMAND_CHECK_TIMEOUT_MS
      );
    } else if (command === 'ls') {
      // ls --version may not work on macOS, just check basic functionality
      isAvailable = await spawnCheckSuccess(
        'ls',
        ['-la', '.'],
        COMMAND_CHECK_TIMEOUT_MS
      );
    } else if (command === 'grep') {
      // grep --version may not work on macOS BSD grep, check basic functionality
      isAvailable = await spawnCheckSuccess(
        'grep',
        ['--help'],
        COMMAND_CHECK_TIMEOUT_MS
      );
    } else {
      // For rg and GNU tools, --version works
      isAvailable = await spawnCheckSuccess(
        command,
        [cmdInfo.versionFlag],
        COMMAND_CHECK_TIMEOUT_MS
      );
    }

    const result: CommandAvailabilityResult = {
      available: isAvailable,
      command,
      ...(isAvailable
        ? {}
        : {
            error: `${cmdInfo.name} (${command}) is not installed or not in PATH`,
          }),
    };

    availabilityCache.set(command, result);
    return result;
  } catch (error) {
    const result: CommandAvailabilityResult = {
      available: false,
      command,
      error:
        error instanceof Error
          ? error.message
          : `Failed to check ${command} availability`,
    };

    availabilityCache.set(command, result);
    return result;
  }
}

/**
 * Check availability of all required commands
 * @returns Promise<Map<CommandName, CommandAvailabilityResult>>
 */
export async function checkAllCommandsAvailability(): Promise<
  Map<CommandName, CommandAvailabilityResult>
> {
  const results = new Map<CommandName, CommandAvailabilityResult>();

  const checks = await Promise.all([
    checkCommandAvailability('rg'),
    checkCommandAvailability('grep'),
    checkCommandAvailability('find'),
    checkCommandAvailability('ls'),
  ]);

  results.set('rg', checks[0]!);
  results.set('grep', checks[1]!);
  results.set('find', checks[2]!);
  results.set('ls', checks[3]!);

  return results;
}

/**
 * Get a human-readable error message for missing command
 */
export function getMissingCommandError(command: CommandName): string {
  const cmdInfo = REQUIRED_COMMANDS[command];

  const installInstructions: Record<CommandName, string> = {
    rg: 'Install ripgrep: brew install ripgrep (macOS), apt install ripgrep (Ubuntu), or see https://github.com/BurntSushi/ripgrep#installation',
    grep: 'grep should be available on all Unix systems. Check your PATH configuration.',
    find: 'find should be available on all Unix systems. Check your PATH configuration.',
    ls: 'ls should be available on all Unix systems. Check your PATH configuration.',
  };

  return `${cmdInfo.name} (${command}) is not available. ${installInstructions[command]}`;
}

/**
 * Clear the availability cache.
 * @internal Used primarily for testing - not part of public API
 */
export function clearAvailabilityCache(): void {
  availabilityCache.clear();
}
