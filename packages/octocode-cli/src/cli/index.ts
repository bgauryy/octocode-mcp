/**
 * CLI Entry Point
 */

import { parseArgs, hasHelpFlag, hasVersionFlag } from './parser.js';
import { findCommand } from './commands.js';
import { showHelp, showCommandHelp, showVersion } from './help.js';

export { parseArgs, hasHelpFlag, hasVersionFlag } from './parser.js';
export { commands, findCommand } from './commands.js';
export { showHelp, showCommandHelp, showVersion } from './help.js';
export type { ParsedArgs, CLICommand, CLIOption } from './types.js';

/**
 * Run CLI
 * Returns true if a CLI command was handled, false to continue to interactive mode
 */
export async function runCLI(argv?: string[]): Promise<boolean> {
  const args = parseArgs(argv);

  // Global --help
  if (hasHelpFlag(args)) {
    if (args.command) {
      const cmd = findCommand(args.command);
      if (cmd) {
        showCommandHelp(cmd);
        return true;
      }
    }
    showHelp();
    return true;
  }

  // Global --version
  if (hasVersionFlag(args)) {
    showVersion();
    return true;
  }

  // No command - return false to go to interactive mode
  if (!args.command) {
    return false;
  }

  // Find and run command
  const command = findCommand(args.command);

  if (!command) {
    console.log();
    console.log(`  Unknown command: ${args.command}`);
    console.log(`  Run 'octocode --help' to see available commands.`);
    console.log();
    process.exitCode = 1;
    return true;
  }

  // Check for command-specific help
  if (hasHelpFlag(args)) {
    showCommandHelp(command);
    return true;
  }

  // Run the command handler
  await command.handler(args);
  return true;
}
