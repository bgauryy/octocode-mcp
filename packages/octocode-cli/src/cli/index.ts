import { parseArgs, hasHelpFlag, hasVersionFlag } from './parser.js';
import type { CLICommand } from './types.js';
import type { ParsedArgs } from './types.js';

declare const __APP_VERSION__: string;

const AGENT_SUBCOMMAND_NAMES = new Set([
  'search-code',
  'get-file',
  'view-structure',
  'search-repos',
  'search-prs',
  'package-search',
]);

async function loadCommandsModule(): Promise<{
  findCommand(name: string): CLICommand | undefined;
}> {
  return import('./commands.js');
}

async function loadAgentCommandsModule(): Promise<{
  findAgentCommand(name: string): CLICommand | undefined;
}> {
  return import('./agent-commands.js');
}

async function loadAgentCommandSpecsModule(): Promise<{
  findAgentCommandSpec(name: string):
    | import('./agent-command-specs.js').AgentCommandSpec
    | undefined;
  toAgentHelpCommand(spec: import('./agent-command-specs.js').AgentCommandSpec): CLICommand;
}> {
  return import('./agent-command-specs.js');
}

async function loadStaticCommandHelpModule(): Promise<{
  findStaticCommandHelp(name: string): CLICommand | undefined;
  showStaticCommandHelp(command: CLICommand): void;
}> {
  return import('./command-help-specs.js');
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

    if (args.command && AGENT_SUBCOMMAND_NAMES.has(args.command)) {
      const [{ findAgentCommandSpec, toAgentHelpCommand }, { showCommandHelp }] =
        await Promise.all([loadAgentCommandSpecsModule(), loadHelpModule()]);
      const spec = findAgentCommandSpec(args.command);
      if (spec) {
        showCommandHelp(toAgentHelpCommand(spec));
        return true;
      }
    }

    if (args.command) {
      const { findStaticCommandHelp, showStaticCommandHelp } =
        await loadStaticCommandHelpModule();
      const staticCommand = findStaticCommandHelp(args.command);
      if (staticCommand) {
        showStaticCommandHelp(staticCommand);
        return true;
      }

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

  if (AGENT_SUBCOMMAND_NAMES.has(args.command)) {
    const { findAgentCommand } = await loadAgentCommandsModule();
    const agentCommand = findAgentCommand(args.command);
    if (agentCommand) {
      await agentCommand.handler(args);
      return true;
    }
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
