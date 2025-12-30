/**
 * Command availability checking utilities
 * Verifies that required CLI tools (rg, find, ls) are available before use
 */

import { spawnCheckSuccess } from './spawn.js';

/**
 * Result of command availability check
 */
export interface CommandAvailabilityResult {
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

export type CommandName = keyof typeof REQUIRED_COMMANDS;

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
  // Return cached result if available
  if (!forceCheck && availabilityCache.has(command)) {
    return availabilityCache.get(command)!;
  }

  const cmdInfo = REQUIRED_COMMANDS[command];

  try {
    // macOS find doesn't support --version, use different approach
    let isAvailable: boolean;

    if (command === 'find' && process.platform === 'darwin') {
      // On macOS, just check if find exists by running with minimal args
      isAvailable = await spawnCheckSuccess(
        'find',
        ['.', '-maxdepth', '0'],
        5000
      );
    } else if (command === 'ls') {
      // ls --version may not work on macOS, just check basic functionality
      isAvailable = await spawnCheckSuccess('ls', ['-la', '.'], 5000);
    } else if (command === 'grep') {
      // grep --version may not work on macOS BSD grep, check basic functionality
      isAvailable = await spawnCheckSuccess('grep', ['--help'], 5000);
    } else {
      // For rg and GNU tools, --version works
      isAvailable = await spawnCheckSuccess(
        command,
        [cmdInfo.versionFlag],
        5000
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
 * Clear the availability cache (useful for testing)
 */
export function clearAvailabilityCache(): void {
  availabilityCache.clear();
}
