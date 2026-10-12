import { dim } from './utils/colors.js';
import { reportCrash } from './cli/crash.js';
import { terminateForSignal } from './cli/process-lifecycle.js';

async function main(): Promise<void> {
  const { runCLI } = await import('./cli/index.js');
  await runCLI();
}

process.on('SIGINT', () => terminateForSignal('SIGINT'));
process.on('SIGTERM', () => terminateForSignal('SIGTERM'));

function isExitPromptError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ExitPromptError'
  );
}

main().catch((err: unknown) => {
  if (isExitPromptError(err)) {
    console.log();
    console.log(dim('  Goodbye! 👋'));
    process.exit(0);
  }
  process.exit(reportCrash(err, process.argv.slice(2)));
});
