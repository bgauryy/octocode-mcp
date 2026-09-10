"use strict";

const { existsSync, realpathSync } = require('node:fs');
const { delimiter, dirname, join } = require('node:path');
const { execFileSync } = require('node:child_process');

// Run npm through Node, avoiding .cmd shell quoting and keeping offline package tests compiler-free.
function npmCli() {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    candidates.push(join(directory, 'npm'), join(directory, 'node_modules/npm/bin/npm-cli.js'));
  }
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const resolved = realpathSync(candidate);
    if (resolved.endsWith('npm-cli.js')) return resolved;
  }
  throw new Error('npm CLI is required to verify publishable package tarballs');
}

function runNpm(args, options = {}) {
  return execFileSync(process.execPath, [npmCli(), ...args], { encoding: 'utf8', ...options });
}
module.exports = { runNpm };
