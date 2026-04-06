import { parseArgs, hasHelpFlag, hasVersionFlag } from './parser.js';
import { findCommand } from './commands.js';
import { showHelp, showCommandHelp, showVersion } from './help.js';
import { showToolHelp } from './tool-command.js';

export async function runCLI(argv?: string[]): Promise<boolean> {
  const args = parseArgs(argv);

  if (hasHelpFlag(args)) {
    if (args.command === 'tool' && typeof args.args[0] === 'string') {
      if (showToolHelp(args.args[0])) {
        return true;
      }
    }

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

  if (hasVersionFlag(args)) {
    showVersion();
    return true;
  }

  if (!args.command) {
    return false;
  }

  const command = findCommand(args.command);

  if (!command) {
    console.log();
    console.log(`  Unknown command: ${args.command}`);
    console.log(`  Run 'octocode --help' to see available commands.`);
    console.log();
    process.exitCode = 1;
    return true;
  }

  await command.handler(args);
  return true;
}
