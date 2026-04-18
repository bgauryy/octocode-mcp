import { dim } from './utils/colors.js';
import { runCLI } from './cli/index.js';

async function showTopLevelHelp(): Promise<void> {
  const { showHelp } = await import('./cli/main-help.js');
  showHelp();
}

async function main(): Promise<void> {
  const handled = await runCLI();

  if (handled) {
    return;
  }

  await showTopLevelHelp();
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
