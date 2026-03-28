#!/usr/bin/env node
/**
 * Bootstrap entry point for the octocode-code-engineer skill.
 * Ensures npm dependencies are installed before loading the scanner,
 * which requires native addons (tree-sitter, @ast-grep/napi) and
 * pure-JS packages (typescript) that cannot be bundled.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// When compiled, this file lives at <skill>/scripts/run.js
// Go up one level from scripts/ to reach the skill root
const skillDir = dirname(dirname(__filename));
const nodeModulesDir = join(skillDir, 'node_modules');
const require = createRequire(import.meta.url);

const REQUIRED_PACKAGES = [
  'typescript',
  '@ast-grep/napi',
  'tree-sitter',
  'tree-sitter-typescript',
];

function isDependencyAvailable(pkgName: string): boolean {
  if (existsSync(join(nodeModulesDir, pkgName))) {
    return true;
  }

  try {
    require.resolve(pkgName, { paths: [skillDir] });
    return true;
  } catch {
    return false;
  }
}

const missingPackages = REQUIRED_PACKAGES.filter(pkg => !isDependencyAvailable(pkg));

if (missingPackages.length > 0) {
  process.stderr.write(
    `[octocode-scan] Missing dependencies (${missingPackages.join(', ')}). Installing...\n`
  );
  const result = spawnSync(
    'npm',
    ['install', '--prefix', skillDir, '--no-audit', '--no-fund'],
    {
      stdio: 'inherit',
      shell: false,
    }
  );
  if (result.status !== 0) {
    process.stderr.write(
      `[octocode-scan] Failed to install dependencies.\n` +
      `Run manually: cd ${skillDir} && npm install\n`
    );
    process.exit(1);
  }
  process.stderr.write('[octocode-scan] Dependencies installed.\n');
}

// Dependencies are now available — load and run the main scanner
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
