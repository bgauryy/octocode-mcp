import { createCli } from './cli.js';

const program = createCli();
program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
