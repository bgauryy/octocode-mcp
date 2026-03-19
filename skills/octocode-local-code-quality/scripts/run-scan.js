#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptDir);
const localNodeModulesDir = path.join(skillRoot, 'node_modules');
const localTypeScriptDir = path.join(localNodeModulesDir, 'typescript');

function ensureLocalTypeScriptLink() {
  if (fs.existsSync(localTypeScriptDir)) return;

  let resolvedTypeScriptDir;
  try {
    const tsPackageJson = require.resolve('typescript/package.json', {
      paths: [skillRoot, process.cwd()],
    });
    resolvedTypeScriptDir = path.dirname(tsPackageJson);
  } catch {
    console.error('[octocode-local-code-quality] Missing runtime dependency: typescript');
    console.error('Install dependencies from repo root: yarn install');
    console.error('Or add only this workspace dependency: yarn workspace octocode-local-code-quality add typescript');
    process.exit(1);
  }

  try {
    fs.mkdirSync(localNodeModulesDir, { recursive: true });
    fs.symlinkSync(resolvedTypeScriptDir, localTypeScriptDir, 'dir');
  } catch {
    // Best effort only: even without local link, Node may still resolve from ancestors.
  }
}

function run() {
  ensureLocalTypeScriptLink();

  const entryScript = path.join(scriptDir, 'index.js');
  const child = spawn(process.execPath, [entryScript, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

run();
