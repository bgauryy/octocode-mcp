#!/bin/bash
set -euo pipefail

YARN_ENABLE_SCRIPTS=0 yarn --cwd packages/octocode-cli build:dev >/dev/null

node <<'NODE'
const { spawnSync } = require('node:child_process');

const RUNS = 7;
const COMMANDS = [
  ['node', ['packages/octocode-cli/out/octocode-cli.js', '--help'], 'help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'search-code', '--help'], 'agent_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'install', '--help'], 'install_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'skills', '--help'], 'skills_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'sync', '--help'], 'sync_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'mcp', '--help'], 'mcp_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'token', '--help'], 'token_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', 'cache', '--help'], 'cache_help'],
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
    if (label !== 'version') {
      stdoutBytes += Buffer.byteLength(stdout, 'utf8');
    }

    if (label === 'help') {
      if (!stdout.includes('AGENT TOOLS')) passes = 0;
      if (!stdout.includes('search-code')) passes = 0;
    } else if (label === 'agent_help') {
      if (!stdout.includes('Search code in GitHub repositories')) passes = 0;
      if (!stdout.includes('--query')) passes = 0;
    } else if (label === 'install_help') {
      if (!stdout.includes('Install octocode-mcp for an IDE')) passes = 0;
      if (!stdout.includes('--ide')) passes = 0;
    } else if (label === 'skills_help') {
      if (!stdout.includes('Install Octocode skills across AI clients')) passes = 0;
      if (!stdout.includes('--skill')) passes = 0;
    } else if (label === 'sync_help') {
      if (!stdout.includes('Sync MCP configurations across all IDE clients')) passes = 0;
      if (!stdout.includes('--dry-run')) passes = 0;
    } else if (label === 'mcp_help') {
      if (!stdout.includes('Non-interactive MCP marketplace management')) passes = 0;
      if (!stdout.includes('--client')) passes = 0;
    } else if (label === 'token_help') {
      if (!stdout.includes('Print the GitHub token')) passes = 0;
      if (!stdout.includes('--type')) passes = 0;
    } else if (label === 'cache_help') {
      if (!stdout.includes('Inspect and clean Octocode cache and logs')) passes = 0;
      if (!stdout.includes('--repos')) passes = 0;
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

const metrics = Object.fromEntries([...timings.entries()].map(([label, values]) => [label, median(values)]));
const totalMs = Object.values(metrics).reduce((sum, value) => sum + value, 0);

console.log(`METRIC total_ms=${totalMs.toFixed(3)}`);
for (const [label, value] of Object.entries(metrics)) {
  console.log(`METRIC ${label}_ms=${value.toFixed(3)}`);
}
console.log(`METRIC stdout_bytes=${stdoutBytes}`);
console.log(`METRIC passes=${passes}`);
NODE
