#!/usr/bin/env node
/**
 * Entry point for `scripts/ast/search.js`. Verifies the @ast-grep native
 * addons and other runtime deps are installed before loading the main
 * search logic. If missing, the bootstrap detects the user's package
 * manager and installs into the skill directory, or prints an actionable
 * manual command.
 */
import { ensureNativeDependencies } from '../common/ensure-deps.js';

ensureNativeDependencies(import.meta.url, { tag: '[octocode-ast-search]' });

const { main } = await import('./search-main.js');
main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
