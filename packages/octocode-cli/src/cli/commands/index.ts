/**
 * CLI commands barrel export
 */

import type { CLICommand, ParsedArgs } from '../types.js';
import { setupCommands } from './setup.js';
import { githubCommands } from './github.js';
import { localCommands } from './local.js';
import { lspCommands } from './lsp.js';

/**
 * Validate a required option is present, printing an error if missing.
 * Returns the value or null if missing.
 */
export function requireOption(
  args: ParsedArgs,
  name: string,
  command: string
): string | null {
  const value = args.options[name];
  if (!value || typeof value !== 'string') {
    process.stderr.write(`Error: --${name} is required\n`);
    process.stderr.write(`Usage: octocode ${command} --${name} <value>\n`);
    process.exitCode = 1;
    return null;
  }
  return value;
}

/**
 * All available commands
 */
const commands: CLICommand[] = [
  ...setupCommands,
  ...githubCommands,
  ...localCommands,
  ...lspCommands,
];

/**
 * Find a command by name or alias
 */
export function findCommand(name: string): CLICommand | undefined {
  return commands.find(cmd => cmd.name === name || cmd.aliases?.includes(name));
}
