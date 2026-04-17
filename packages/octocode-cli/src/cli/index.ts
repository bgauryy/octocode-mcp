import { parseArgs, hasHelpFlag, hasVersionFlag } from './parser.js';
import type { CLICommand } from './types.js';
import type { ParsedArgs } from './types.js';

declare const __APP_VERSION__: string;

async function loadCommandsModule(): Promise<{
  findCommand(name: string): CLICommand | undefined;
}> {
  return import('./commands.js');
}

async function loadToolCommandModule(): Promise<{
  executeToolCommand(args: ParsedArgs): Promise<boolean>;
  printToolsContext(): Promise<void>;
  showToolHelp(toolName: string): Promise<boolean>;
}> {
  return import('./tool-command.js');
}

async function loadHelpModule(): Promise<{
  showHelp(): void;
  showCommandHelp(command: CLICommand): void;
}> {
  return import('./help.js');
}

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

function showVersion(): void {
  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
  console.log(`octocode-cli v${version}`);
}

export async function runCLI(argv?: string[]): Promise<boolean> {
  const args = parseArgs(argv);

  if (args.options['tools-context'] === true) {
    const { printToolsContext } = await loadToolCommandModule();
    await printToolsContext();
    return true;
  }

  if (hasHelpFlag(args)) {
    if (
      args.command === 'tool' &&
      typeof args.options.tool === 'string' &&
      typeof args.args[0] === 'string'
    ) {
      const { showToolHelp } = await loadToolCommandModule();
      if (await showToolHelp(args.args[0])) {
        return true;
      }
    }

    if (args.command === 'tool') {
      const { showHelp } = await loadHelpModule();
      showHelp();
      return true;
    }

    if (args.command) {
      const [{ findCommand }, { showCommandHelp, showHelp }] = await Promise.all([
        loadCommandsModule(),
        loadHelpModule(),
      ]);
      const cmd = findCommand(args.command);
      if (cmd) {
        showCommandHelp(cmd);
        return true;
      }
      showHelp();
      return true;
    }

    const { showHelp } = await loadHelpModule();
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

    console.error(
      "  warning: --tool is deprecated; use 'octocode-cli <subcommand>' (e.g. search-code, get-file). See 'octocode-cli --help'."
    );

    const { executeToolCommand } = await loadToolCommandModule();
    const success = await executeToolCommand(args);
    if (!success) {
      process.exitCode = 1;
    }
    return true;
  }

  const { findCommand } = await loadCommandsModule();
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
