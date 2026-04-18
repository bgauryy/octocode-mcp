#!/usr/bin/env node
/**
 * Entry point for the octocode-engineer scanner. Verifies runtime
 * dependencies (native addons that cannot be bundled + the TypeScript
 * compiler) are installed before loading the pipeline. If missing, the
 * bootstrap detects the user's package manager from lockfiles and installs
 * into the skill's own node_modules, or prints an actionable manual command.
 */
import { ensureNativeDependencies } from './common/ensure-deps.js';

ensureNativeDependencies(import.meta.url, { tag: '[octocode-scan]' });

const { main, EXIT_ERROR } = await import('./pipeline/main.js');
const { OptionsError } = await import('./pipeline/create-options.js');
try {
  const exitCode = await main();
  process.exitCode = exitCode;
} catch (err: unknown) {
  if (err instanceof OptionsError) {
    process.stderr.write(`${err.message}\n`);
  } else {
    console.error(err);
  }
  process.exitCode = EXIT_ERROR;
}
