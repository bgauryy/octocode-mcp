import { c, bold, dim } from '../utils/colors.js';
import { getAppContext } from '../utils/context.js';

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

export function printWelcome(): void {
  const width = process.stdout.columns ?? 80;
  console.log();
  if (width >= 72 && (process.stdout.rows ?? 24) >= 32) {
    printTitle();
    console.log();
  }
  console.log(`  ${c('magenta', '◆')} ${bold('Octocode')}`);
  console.log(`  ${dim('Code research. Clear answers.')}`);
  console.log();

  try {
    const ctx = getAppContext();
    console.log(`  ${dim('Workspace')} ${ctx.cwd}`);
    if (ctx.git) console.log(`  ${dim('Branch')} ${ctx.git.branch}`);
    if (ctx.ide === 'Cursor' || ctx.ide === 'VS Code') {
      console.log(`  ${dim('Editor')} ${ctx.ide}`);
    }
  } catch {
    // Workspace metadata is optional; setup remains available.
  }
  console.log();
}

export function printGoodbye(): void {
  console.log();
  console.log(`  ${c('magenta', '◆')} ${bold('Octocode')}`);
  console.log(`  ${dim('Continue setup:')} octocode install`);
  console.log(`  ${dim('Explore tools:')}  octocode tools`);
  console.log(`  ${c('cyan', 'https://octocode.ai')}`);
  console.log();
}
