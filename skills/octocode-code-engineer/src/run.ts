#!/usr/bin/env node
/**
 * Bootstrap entry point for the octocode-code-engineer skill.
 * Ensures npm dependencies are installed before loading the scanner,
 * which requires native addons (tree-sitter, @ast-grep/napi) and
 * pure-JS packages (typescript) that cannot be bundled.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// When compiled, this file lives at <skill>/scripts/run.js
// Go up one level from scripts/ to reach the skill root
const skillDir = dirname(dirname(__filename));
const nodeModulesDir = join(skillDir, 'node_modules');

if (!existsSync(join(nodeModulesDir, 'typescript'))) {
  process.stderr.write('[octocode-scan] First run: installing dependencies...\n');
  const result = spawnSync('npm', ['install', '--prefix', skillDir], {
    stdio: 'inherit',
    shell: false,
  });
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
const { main } = await import('./pipeline/main.js');
await main();
