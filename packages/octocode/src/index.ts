import { runCLI } from './cli/index.js';

runCLI().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 5;
});
