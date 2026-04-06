import { c, bold, dim } from '../utils/colors.js';
import type { CLICommand } from './types.js';

declare const __APP_VERSION__: string;

export function showHelp(): void {
  console.log();
  console.log(
    `  ${c('magenta', bold('🔍🐙 Octocode CLI'))} - Install and configure octocode-mcp`
  );
  console.log();
  console.log(`  ${bold('USAGE')}`);
  console.log(`    ${c('magenta', 'octocode-cli')} [command] [options]`);
  console.log();
  console.log(`  ${bold('COMMANDS')}`);
  console.log(
    `    ${c('magenta', 'install')}     Configure octocode-mcp for an IDE`
  );
  console.log(
    `    ${c('magenta', 'skills')}      Install Octocode skills across AI clients`
  );
  console.log(
    `    ${c('magenta', 'cache')}       Inspect and clean Octocode cache directories`
  );
  console.log(
    `    ${c('magenta', 'sync')}        Sync MCP configurations across all IDEs`
  );
  console.log(
    `    ${c('magenta', 'mcp')}         Manage MCP marketplace non-interactively`
  );
  console.log(
    `    ${c('magenta', 'auth')}        Manage GitHub authentication`
  );
  console.log(`    ${c('magenta', 'login')}       Authenticate with GitHub`);
  console.log(`    ${c('magenta', 'logout')}      Sign out from GitHub`);
  console.log(
    `    ${c('magenta', 'status')}      Show GitHub authentication status`
  );
  console.log(
    `    ${c('magenta', 'token')}       Print the stored GitHub OAuth token`
  );
  console.log();
  console.log(`  ${bold('OPTIONS')}`);
  console.log(`    ${c('cyan', '-h, --help')}       Show this help message`);
  console.log(
    `    ${c('cyan', '--tools-context')}  Print Octocode MCP instructions and tool schemas`
  );
  console.log(
    `    ${c('cyan', '--tool <name> <json>')}  Run one Octocode tool with one JSON payload`
  );
  console.log(`    ${c('cyan', '-v, --version')}    Show version number`);
  console.log();
  console.log(`  ${bold('EXAMPLES')}`);
  console.log(`    ${dim('# Interactive mode')}`);
  console.log(`    ${c('yellow', 'octocode-cli')}`);
  console.log();
  console.log(`    ${dim('# Install for Cursor using npx')}`);
  console.log(
    `    ${c('yellow', 'octocode-cli install --ide cursor --method npx')}`
  );
  console.log();
  console.log(`    ${dim('# Install for Claude Desktop using direct method')}`);
  console.log(
    `    ${c('yellow', 'octocode-cli install --ide claude-desktop --method direct')}`
  );
  console.log();
  console.log(`    ${dim('# Check GitHub authentication')}`);
  console.log(`    ${c('yellow', 'octocode-cli auth')}`);
  console.log();
  console.log(`    ${dim('# Get token from Octocode (default)')}`);
  console.log(`    ${c('yellow', 'octocode-cli token')}`);
  console.log();
  console.log(`    ${dim('# Get token from gh CLI')}`);
  console.log(`    ${c('yellow', 'octocode-cli token --type=gh')}`);
  console.log();
  console.log(`    ${dim('# Sync MCP configs across all IDEs')}`);
  console.log(`    ${c('yellow', 'octocode-cli sync')}`);
  console.log(`    ${c('yellow', 'octocode-cli sync --status')}`);
  console.log();
  console.log(`    ${dim('# MCP marketplace via CLI')}`);
  console.log(`    ${c('yellow', 'octocode-cli mcp list --search browser')}`);
  console.log(
    `    ${c('yellow', 'octocode-cli mcp install --id playwright-mcp --client cursor --force')}`
  );
  console.log(
    `    ${c('yellow', 'octocode-cli mcp remove --id playwright-mcp --client cursor')}`
  );
  console.log();
  console.log(`    ${dim('# Install Octocode skills')}`);
  console.log(`    ${c('yellow', 'octocode-cli skills install')}`);
  console.log(
    `    ${c('yellow', 'octocode-cli skills install --skill octocode-researcher')}`
  );
  console.log(
    `    ${c('yellow', 'octocode-cli skills install --targets claude-code,cursor,codex --mode symlink')}`
  );
  console.log();
  console.log(`    ${dim('# Remove one installed skill')}`);
  console.log(
    `    ${c('yellow', 'octocode-cli skills remove --skill octocode-researcher --targets claude-code,cursor')}`
  );
  console.log();
  console.log(`    ${dim('# Run a tool directly')}`);
  console.log(
    `    ${c('yellow', `octocode-cli --tool localSearchCode '{"path":".","pattern":"runCLI"}'`)}`
  );
  console.log(
    `    ${c('yellow', `octocode-cli --tool githubSearchCode '{"owner":"bgauryy","repo":"octocode-mcp","keywordsToSearch":["tool"]}'`)}`
  );
  console.log();
  console.log(`    ${dim('# Print MCP instructions and tool schemas')}`);
  console.log(`    ${c('yellow', 'octocode-cli --tools-context')}`);
  console.log();
  console.log(c('magenta', `  ─── 🔍🐙 ${bold('https://octocode.ai')} ───`));
  console.log();
}

export function showCommandHelp(command: CLICommand): void {
  console.log();
  console.log(`  ${c('magenta', bold('🔍🐙 octocode-cli ' + command.name))}`);
  console.log();
  console.log(`  ${command.description}`);
  console.log();

  if (command.usage) {
    console.log(`  ${bold('USAGE')}`);
    console.log(
      `    ${command.usage.replace(/\boctocode\b/g, 'octocode-cli')}`
    );
    console.log();
  }

  if (command.options && command.options.length > 0) {
    console.log(`  ${bold('OPTIONS')}`);
    for (const opt of command.options) {
      const shortFlag = opt.short ? `-${opt.short}, ` : '    ';
      const longFlag = `--${opt.name}`;
      const valueHint = opt.hasValue ? ` <value>` : '';
      const defaultHint =
        opt.default !== undefined ? dim(` (default: ${opt.default})`) : '';
      console.log(
        `    ${c('cyan', shortFlag + longFlag + valueHint)}${defaultHint}`
      );
      console.log(`        ${opt.description}`);
    }
    console.log();
  }
}

export function showVersion(): void {
  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
  console.log(`octocode-cli v${version}`);
}
