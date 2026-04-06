import { parseArgs, hasHelpFlag, hasVersionFlag } from './parser.js';
import { findCommand } from './commands.js';
import { showHelp, showCommandHelp, showVersion } from './help.js';
import {
  executeToolCommand,
  printToolsContext,
  showToolHelp,
} from './tool-command.js';

function printLegacyToolCommandError(): void {
  console.log();
  console.log(
    "  Use octocode-cli --tool <toolName> '<json-stringified-input>'."
  );
  console.log(
    '  Example: octocode-cli --tool localSearchCode \'{"path":".","pattern":"runCLI"}\''
  );
  console.log();
}

export async function runCLI(argv?: string[]): Promise<boolean> {
  const args = parseArgs(argv);

  if (args.options['tools-context'] === true) {
    await printToolsContext();
    return true;
  }

  if (hasHelpFlag(args)) {
    if (
      args.command === 'tool' &&
      typeof args.options.tool === 'string' &&
      typeof args.args[0] === 'string'
    ) {
      if (await showToolHelp(args.args[0])) {
        return true;
      }
    }

    if (args.command === 'tool') {
      showHelp();
      return true;
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

  if (args.command === 'tool') {
    if (typeof args.options.tool !== 'string') {
      printLegacyToolCommandError();
      process.exitCode = 1;
      return true;
    }

    const success = await executeToolCommand(args);
    if (!success) {
      process.exitCode = 1;
    }
    return true;
  }

  const command = findCommand(args.command);

  if (!command) {
    console.log();
    console.log(`  Unknown command: ${args.command}`);
    console.log(`  Run 'octocode-cli --help' to see available commands.`);
    console.log();
    process.exitCode = 1;
    return true;
  }

  await command.handler(args);
  return true;
}
