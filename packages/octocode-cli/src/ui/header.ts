/**
 * UI Header Components
 */

import { c, bold, dim } from '../utils/colors.js';
import { getPlatformName, getArchitecture, HOME } from '../utils/platform.js';
import { getAppContext } from '../utils/context.js';

/**
 * Print the main header
 */
export function printHeader(): void {
  const width = 64;

  console.log();
  console.log(c('magenta', '╭' + '─'.repeat(width - 2) + '╮'));
  console.log(
    c('magenta', '│') +
      padCenter(bold(c('magenta', '  🔍🐙 Octocode CLI')), width - 2) +
      c('magenta', '│')
  );
  console.log(
    c('magenta', '│') +
      padCenter(dim('  Install and configure octocode-mcp'), width - 2) +
      c('magenta', '│')
  );
  console.log(c('magenta', '╰' + '─'.repeat(width - 2) + '╯'));

  console.log();
  console.log(
    `  ${dim('Platform:')} ${bold(getPlatformName())} ${dim('|')} ` +
      `${dim('Arch:')} ${bold(getArchitecture())} ${dim('|')} ` +
      `${dim('Home:')} ${bold(HOME)}`
  );
  console.log();
}

/**
 * Print the ASCII logo
 */
function printLogo(): void {
  const logo = [
    '        ▄▄██████▄▄',
    '      ▄██████████████▄',
    '     ▐████████████████▌',
    '     ▐██▀  ▀████▀  ▀██▌',
    '     ▐██  ▄ ████ ▄  ██▌',
    '     ▐████▄▄▀▀▀▀▄▄████▌',
    '      ▀██████████████▀',
    '    ▄▄▄████▀▀  ▀▀████▄▄▄',
    ' ▄████▀▀▄▄▄██████▄▄▄▀▀████▄',
    '▐██▌  ▄██▀▀      ▀▀██▄  ▐██▌',
    ' ▀▀  ▐██▌          ▐██▌  ▀▀',
    '      ▀▀            ▀▀',
  ];

  for (const line of logo) {
    console.log(c('magenta', '  ' + line));
  }
}

/**
 * Print the ASCII Title
 */
function printTitle(): void {
  const title = [
    ' ██████╗  ██████╗████████╗ ██████╗  ██████╗ ██████╗ ██████╗ ███████╗',
    '██╔═══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝',
    '██║   ██║██║        ██║   ██║   ██║██║     ██║   ██║██║  ██║█████╗  ',
    '██║   ██║██║        ██║   ██║   ██║██║     ██║   ██║██║  ██║██╔══╝  ',
    '╚██████╔╝╚██████╗   ██║   ╚██████╔╝╚██████╗╚██████╔╝██████╔╝███████╗',
    ' ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
  ];

  for (const line of title) {
    console.log(c('magenta', ' ' + line));
  }
}

/**
 * Print welcome message
 */
export function printWelcome(): void {
  console.log();
  printLogo();
  console.log();
  printTitle();
  console.log();
  console.log();

  try {
    const ctx = getAppContext();

    // Full path outside the box
    console.log(`  ${dim('📂')} ${ctx.cwd}`);

    // Simple context line - only show IDE if detected (not plain Terminal)
    const isIDE = ctx.ide === 'Cursor' || ctx.ide === 'VS Code';
    if (isIDE || ctx.git) {
      let envLine = '';
      if (isIDE) {
        envLine = `  ${dim('💻')} ${bold(ctx.ide)}`;
      }
      if (ctx.git) {
        const gitPart = `${dim('🐙')} ${ctx.git.root} ${dim('(')}${ctx.git.branch}${dim(')')}`;
        envLine += isIDE ? `   ${gitPart}` : `  ${gitPart}`;
      }
      console.log(envLine);
    }
    console.log();
  } catch {
    // Silently continue if context detection fails
    console.log();
  }
}

/**
 * Print goodbye message
 */
export function printGoodbye(): void {
  console.log();
  console.log(c('magenta', '─'.repeat(66)));
  console.log(c('magenta', '  Thanks for using Octocode CLI'));
  console.log(c('magenta', `  🔍🐙 ${c('underscore', 'https://octocode.ai')}`));
  console.log(c('magenta', '─'.repeat(66)));
  console.log();
}

// Helper functions
function getVisualWidth(str: string): number {
  // Remove ANSI codes for width calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const chars = [...stripped];
  // Count emojis (each takes 2 visual columns)
  const emojiCount = chars.filter(char =>
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(char)
  ).length;
  return chars.length + emojiCount;
}

function padCenter(str: string, width: number): string {
  const visualWidth = getVisualWidth(str);
  const padding = Math.max(0, width - visualWidth);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
}
