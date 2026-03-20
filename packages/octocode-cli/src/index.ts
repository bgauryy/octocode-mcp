import { c, bold, dim } from './utils/colors.js';
import { clearScreen } from './utils/platform.js';
import { loadInquirer } from './utils/prompts.js';
import { printWelcome, printGoodbye } from './ui/header.js';
import { Spinner } from './utils/spinner.js';
import {
  checkAndPrintEnvironmentWithLoader,
  printNodeDoctorHint,
  hasEnvironmentIssues,
} from './ui/install/index.js';
import { runMenuLoop } from './ui/menu.js';
import { runCLI } from './cli/index.js';

function printEnvHeader(): void {
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🔍 ${bold('Environment')}`);
  console.log(c('blue', '━'.repeat(66)));
}

async function runInteractiveMode(): Promise<void> {
  const loadingSpinner = new Spinner('  Starting...').start();
  await loadInquirer();
  loadingSpinner.clear();

  clearScreen();
  printWelcome();

  printEnvHeader();

  const envStatus = await checkAndPrintEnvironmentWithLoader();

  if (hasEnvironmentIssues(envStatus)) {
    console.log();
    console.log(
      `  ${dim('💡')} ${dim('Run')} ${c('cyan', 'npx node-doctor')} ${dim('for diagnostics')}`
    );
  }

  if (!envStatus.nodeInstalled) {
    console.log();
    console.log(
      `  ${c('red', '✗')} ${bold('Node.js is required to run octocode-mcp')}`
    );
    printNodeDoctorHint();
    printGoodbye();
    return;
  }

  await runMenuLoop();
}

async function main(): Promise<void> {
  const handled = await runCLI();

  if (handled) {
    return;
  }

  await runInteractiveMode();
}

function handleTermination(): void {
  process.stdout.write('\x1B[?25h');
  console.log();
  console.log(dim('  Goodbye! 👋'));
  process.exit(0);
}

process.on('SIGINT', handleTermination);

process.on('SIGTERM', handleTermination);

main().catch(err => {
  if (err?.name === 'ExitPromptError') {
    console.log();
    console.log(dim('  Goodbye! 👋'));
    process.exit(0);
  }
  console.error('Error:', err);
  process.exit(1);
});
