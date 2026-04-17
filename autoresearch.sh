#!/bin/bash
set -euo pipefail

YARN_ENABLE_SCRIPTS=0 yarn --cwd packages/octocode-cli build:dev >/dev/null

node <<'NODE'
const { spawnSync } = require('node:child_process');

const RUNS = 9;
const COMMANDS = [
  ['node', ['packages/octocode-cli/out/octocode-cli.js', '--help'], 'help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'search-code', '--help'], 'agent_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'install', '--help'], 'admin_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', '--version'], 'version'],
];

const timings = new Map(COMMANDS.map(([, , label]) => [label, []]));
let stdoutBytes = 0;
let passes = 1;

for (let i = 0; i < RUNS; i++) {
  for (const [command, args, label] of COMMANDS) {
    const start = process.hrtime.bigint();
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      env: process.env,
    });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    timings.get(label).push(elapsedMs);

    if (result.status !== 0) {
      passes = 0;
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      break;
    }

    const stdout = result.stdout || '';
    if (label === 'help') {
      stdoutBytes += Buffer.byteLength(stdout, 'utf8');
      if (!stdout.includes('AGENT TOOLS')) passes = 0;
      if (!stdout.includes('search-code')) passes = 0;
    } else if (label === 'agent_help') {
      stdoutBytes += Buffer.byteLength(stdout, 'utf8');
      if (!stdout.includes('Search code in GitHub repositories')) passes = 0;
      if (!stdout.includes('--query')) passes = 0;
    } else if (label === 'admin_help') {
      stdoutBytes += Buffer.byteLength(stdout, 'utf8');
      if (!stdout.includes('Install octocode-mcp for an IDE')) passes = 0;
      if (!stdout.includes('--ide')) passes = 0;
    } else if (label === 'version') {
      if (!stdout.includes('octocode-cli v')) passes = 0;
    }
  }
  if (passes === 0) break;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

const helpMs = median(timings.get('help'));
const agentHelpMs = median(timings.get('agent_help'));
const adminHelpMs = median(timings.get('admin_help'));
const versionMs = median(timings.get('version'));
const totalMs = helpMs + agentHelpMs + adminHelpMs + versionMs;

console.log(`METRIC total_ms=${totalMs.toFixed(3)}`);
console.log(`METRIC help_ms=${helpMs.toFixed(3)}`);
console.log(`METRIC agent_help_ms=${agentHelpMs.toFixed(3)}`);
console.log(`METRIC admin_help_ms=${adminHelpMs.toFixed(3)}`);
console.log(`METRIC version_ms=${versionMs.toFixed(3)}`);
console.log(`METRIC stdout_bytes=${stdoutBytes}`);
console.log(`METRIC passes=${passes}`);
NODE
