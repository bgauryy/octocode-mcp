/**
 * CLI Help Text
 */

import { c, bold, dim } from '../utils/colors.js';
import type { CLICommand } from './types.js';
import { getAllCommands } from './commands/index.js';

declare const __APP_VERSION__: string;

const CATEGORY_LABELS: Record<string, string> = {
  github: 'GitHub',
  local: 'Local',
  lsp: 'LSP',
};

/**
 * Show main help
 */
export function showHelp(): void {
  const commands = getAllCommands();
  const setupCmds = commands.filter(cmd => !cmd.category);
  const researchCmds = commands.filter(cmd => cmd.category);

  // Group research commands by category (preserving insertion order)
  const groups = new Map<string, CLICommand[]>();
  for (const cmd of researchCmds) {
    const cat = cmd.category!;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(cmd);
  }

  console.log();
  console.log(
    `  ${c('magenta', bold('🔍🐙 Octocode CLI'))} - Install and configure octocode-mcp`
  );
  console.log();
  console.log(`  ${bold('USAGE')}`);
  console.log(`    ${c('magenta', 'octocode')} [command] [options]`);
  console.log();

  // Setup commands
  console.log(`  ${bold('COMMANDS')}`);
  const setupMaxLen = Math.max(...setupCmds.map(cmd => cmd.name.length));
  for (const cmd of setupCmds) {
    const padded = cmd.name.padEnd(setupMaxLen + 4);
    console.log(`    ${c('magenta', padded)} ${cmd.description}`);
  }
  console.log();

  // Research commands grouped by category
  console.log(`  ${bold('RESEARCH COMMANDS')}`);
  const researchMaxLen = Math.max(...researchCmds.map(cmd => cmd.name.length));
  for (const [cat, cmds] of groups) {
    console.log(`    ${dim(CATEGORY_LABELS[cat] + ':')}`);
    for (const cmd of cmds) {
      const padded = cmd.name.padEnd(researchMaxLen + 2);
      console.log(`    ${c('magenta', padded)} ${cmd.description}`);
    }
  }
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
