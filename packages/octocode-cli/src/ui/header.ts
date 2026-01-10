/**
 * UI Header Components
 */

import { c, bold, dim } from '../utils/colors.js';
import { getAppContext } from '../utils/context.js';

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
 * Print goodbye message with helpful tips
 */
export function printGoodbye(): void {
  console.log();
  console.log(
    `  ${c('cyan', '💡')} ${bold('Quick tips for better AI coding with Octocode:')}`
  );
  console.log();
  console.log(
    `     ${c('green', '▸')} ${dim('Prompts:')}  Use ${c('cyan', '/research')}, ${c('cyan', '/plan')}, ${c('cyan', '/implement')} in chat`
  );
  console.log(
    `     ${c('green', '▸')} ${dim('Skills:')}   Add all via ${c('cyan', 'Manage System Skills')} → ${c('cyan', 'Octocode Official')}`
  );
  console.log(
    `     ${c('green', '▸')} ${dim('Context:')}  Add ${c('cyan', 'AGENTS.md')} to your project ${dim('(you can ask octocode)')}`
  );
  console.log();
  console.log(`  🔍🐙 ${c('underscore', 'https://octocode.ai')}`);
  console.log();
}
