#!/bin/bash
set -euo pipefail

YARN_ENABLE_SCRIPTS=0 yarn --cwd packages/octocode-cli build:dev >/dev/null

node <<'NODE'
const { spawnSync } = require('node:child_process');

const RUNS = 5;
const COMMANDS = [
  [
    'node',
    [
      'packages/octocode-cli/out/octocode-cli.js',
      '--tool',
      'localSearchCode',
      '{"path":"packages/octocode-cli/src/cli","pattern":"runCLI","smartCase":true,"matchContentLength":80,"filesPerPage":5,"filePageNumber":1,"matchesPerPage":5,"binaryFiles":"text","includeStats":false,"sort":"path","showFileLastModified":false}',
    ],
    'local_search',
  ],
  [
    'node',
    [
      'packages/octocode-cli/out/octocode-cli.js',
      '--tool',
      'localGetFileContent',
      '{"path":"packages/octocode-cli/src/cli/index.ts","fullContent":false,"matchStringContextLines":5,"matchStringIsRegex":false,"matchStringCaseSensitive":true,"matchString":"runCLI"}',
    ],
    'local_get_file',
  ],
  [
    'node',
    [
      'packages/octocode-cli/out/octocode-cli.js',
      '--tool',
      'localFindFiles',
      '{"path":"packages/octocode-cli/src/cli","sortBy":"name","details":false,"filesPerPage":10,"filePageNumber":1,"showFileLastModified":false,"name":"*.ts"}',
    ],
    'local_find_files',
  ],
  [
    'node',
    [
      'packages/octocode-cli/out/octocode-cli.js',
      '--tool',
      'localViewStructure',
      '{"path":"packages/octocode-cli/src/cli","details":false,"hidden":false,"humanReadable":true,"sortBy":"name","entriesPerPage":20,"entryPageNumber":1,"showFileLastModified":false,"depth":1}',
    ],
    'local_view_structure',
  ],
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

    if (label === 'local_search') {
      if (!stdout.includes('runCLI')) passes = 0;
      if (!stdout.includes('index.ts')) passes = 0;
    } else if (label === 'local_get_file') {
      if (!stdout.includes('runCLI')) passes = 0;
      if (!stdout.includes('printToolsContext')) passes = 0;
    } else if (label === 'local_find_files') {
      if (!stdout.includes('index.ts')) passes = 0;
      if (!stdout.includes('tool-command.ts')) passes = 0;
    } else if (label === 'local_view_structure') {
      if (!stdout.includes('index.ts')) passes = 0;
      if (!stdout.includes('tool-command.ts')) passes = 0;
    }
  }
  if (passes === 0) break;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

const metrics = Object.fromEntries(
  [...timings.entries()].map(([label, values]) => [label, median(values)])
);
const totalMs = Object.values(metrics).reduce((sum, value) => sum + value, 0);

console.log(`METRIC total_ms=${totalMs.toFixed(3)}`);
for (const [label, value] of Object.entries(metrics)) {
  console.log(`METRIC ${label}_ms=${value.toFixed(3)}`);
}
console.log(`METRIC stdout_bytes=${stdoutBytes}`);
console.log(`METRIC passes=${passes}`);
NODE
