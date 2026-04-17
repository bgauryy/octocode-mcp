#!/bin/bash
set -euo pipefail

YARN_ENABLE_SCRIPTS=0 yarn --cwd packages/octocode-cli build:dev >/dev/null

node <<'NODE'
const { spawnSync } = require('node:child_process');

const RUNS = 5;
const COMMANDS = [
  ['node', ['packages/octocode-cli/out/octocode-cli.js', '--tool', 'localSearchCode', '--help'], 'local_tool_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', '--tool', 'githubSearchCode', '--help'], 'github_tool_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', '--tool', 'packageSearch', '--help'], 'package_tool_help'],
  ['node', ['packages/octocode-cli/out/octocode-cli.js', '--tools-context'], 'tools_context'],
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
    stdoutBytes += Buffer.byteLength(stdout, 'utf8');

    if (label === 'local_tool_help') {
      if (!stdout.includes('localSearchCode')) passes = 0;
      if (!stdout.includes('Required')) passes = 0;
      if (!stdout.includes('Example')) passes = 0;
    } else if (label === 'github_tool_help') {
      if (!stdout.includes('githubSearchCode')) passes = 0;
      if (!stdout.includes('Auto-filled')) passes = 0;
      if (!stdout.includes('mainResearchGoal')) passes = 0;
    } else if (label === 'package_tool_help') {
      if (!stdout.includes('packageSearch')) passes = 0;
      if (!stdout.includes('Auto-filled')) passes = 0;
      if (!stdout.includes('Example')) passes = 0;
    } else if (label === 'tools_context') {
      if (!stdout.includes('CLI Contract:')) passes = 0;
      if (!stdout.includes('Octocode MCP Instructions:')) passes = 0;
      if (!stdout.includes('localSearchCode')) passes = 0;
      if (!stdout.includes('githubSearchCode')) passes = 0;
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
