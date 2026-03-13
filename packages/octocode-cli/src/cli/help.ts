/**
 * CLI Help Text
 */

import { c, bold, dim } from '../utils/colors.js';
import type { CLICommand } from './types.js';

declare const __APP_VERSION__: string;

/**
 * Show main help
 */
export function showHelp(): void {
  console.log();
  console.log(
    `  ${c('magenta', bold('🔍🐙 Octocode CLI'))} - Install and configure octocode-mcp`
  );
  console.log();
  console.log(`  ${bold('USAGE')}`);
  console.log(`    ${c('magenta', 'octocode')} [command] [options]`);
  console.log();
  console.log(`  ${bold('COMMANDS')}`);
  console.log(
    `    ${c('magenta', 'install')}     Configure octocode-mcp for an IDE`
  );
  console.log(
    `    ${c('magenta', 'skills')}      Install Octocode skills for Claude Code`
  );
  console.log(
    `    ${c('magenta', 'sync')}        Sync MCP configurations across all IDEs`
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
  console.log(`  ${bold('RESEARCH COMMANDS')}`);
  console.log(`    ${dim('GitHub:')}`);
  console.log(
    `    ${c('magenta', 'search-code')}       Search code across GitHub repositories`
  );
  console.log(
    `    ${c('magenta', 'get-file')}          Get file content from a GitHub repository`
  );
  console.log(
    `    ${c('magenta', 'tree')}              View repository directory structure`
  );
  console.log(
    `    ${c('magenta', 'search-repos')}      Search GitHub repositories`
  );
  console.log(
    `    ${c('magenta', 'search-prs')}        Search pull requests on GitHub`
  );
  console.log(
    `    ${c('magenta', 'search-packages')}   Search npm or PyPI packages`
  );
  console.log(`    ${dim('Local:')}`);
  console.log(
    `    ${c('magenta', 'local-search')}      Search local code with ripgrep`
  );
  console.log(
    `    ${c('magenta', 'local-file')}        Read local file content`
  );
  console.log(
    `    ${c('magenta', 'local-find')}        Find local files by name, type, or metadata`
  );
  console.log(
    `    ${c('magenta', 'local-tree')}        View local directory structure`
  );
  console.log(`    ${dim('LSP:')}`);
  console.log(
    `    ${c('magenta', 'lsp-definition')}    Go to symbol definition`
  );
  console.log(
    `    ${c('magenta', 'lsp-references')}    Find all references to a symbol`
  );
  console.log(
    `    ${c('magenta', 'lsp-call-hierarchy')} Trace call relationships`
  );
  console.log();
  console.log(`  ${bold('OPTIONS')}`);
  console.log(`    ${c('cyan', '-h, --help')}       Show this help message`);
  console.log(`    ${c('cyan', '-v, --version')}    Show version number`);
  console.log();
  console.log(`  ${bold('EXAMPLES')}`);
  console.log(`    ${dim('# Interactive mode')}`);
  console.log(`    ${c('yellow', 'octocode')}`);
  console.log();
  console.log(`    ${dim('# Install for Cursor using npx')}`);
  console.log(
    `    ${c('yellow', 'octocode install --ide cursor --method npx')}`
  );
  console.log();
  console.log(`    ${dim('# Install for Claude Desktop using direct method')}`);
  console.log(
    `    ${c('yellow', 'octocode install --ide claude --method direct')}`
  );
  console.log();
  console.log(`    ${dim('# Check GitHub authentication')}`);
  console.log(`    ${c('yellow', 'octocode auth')}`);
  console.log();
  console.log(`    ${dim('# Get token from Octocode (default)')}`);
  console.log(`    ${c('yellow', 'octocode token')}`);
  console.log();
  console.log(`    ${dim('# Get token from gh CLI')}`);
  console.log(`    ${c('yellow', 'octocode token --type=gh')}`);
  console.log();
  console.log(`    ${dim('# Install Octocode skills')}`);
  console.log(`    ${c('yellow', 'octocode skills install')}`);
  console.log();
  console.log(c('magenta', `  ─── 🔍🐙 ${bold('https://octocode.ai')} ───`));
  console.log();
}

/**
 * Show help for a specific command
 */
export function showCommandHelp(command: CLICommand): void {
  console.log();
  console.log(`  ${c('magenta', bold('🔍🐙 octocode ' + command.name))}`);
  console.log();
  console.log(`  ${command.description}`);
  console.log();

  if (command.usage) {
    console.log(`  ${bold('USAGE')}`);
    console.log(`    ${command.usage}`);
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

/**
 * Show version
 */
export function showVersion(): void {
  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
  console.log(`octocode v${version}`);
}
